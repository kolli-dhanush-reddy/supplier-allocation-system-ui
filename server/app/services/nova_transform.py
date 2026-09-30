"""
Nova API → Pydantic Model Transformer
======================================
Converts raw Nova API dicts into the Pydantic models the rest of the
system already uses.  No networking happens here — it only transforms.

Mapping logic
-------------
Nova vendor      → Supplier
Nova inventory   → SKUDemand  (with synthetic 6-week demand forecast)
Nova PO history  → PricingEntry (average historical price per vendor×item)
Nova PO          → PurchaseOrder
Nova PO history  → SupplierCapacity (derived from volume per vendor)

Key decisions
-------------
* Reliability score: derived from vendor criticality field
    high   → 90   (critical supplier, well-managed)
    medium → 75
    low    → 60
  plus an early-pay discount bonus (+5) and late-penalty malus (-5)

* Lead time: taken directly from inventory item's lead_time_days.
  For items with multiple vendors we use primary_vendor lead time as
  the base and ±20% for secondary vendors.

* Weekly capacity: estimated as 3× the highest single-week quantity
  ever ordered from that vendor (from PO history).  Floor of 500 units.

* MOQ: estimated as the smallest single-order quantity seen in PO history
  for that vendor. Floor of 1 unit.

* Demand forecast: 6-week rolling average derived from the last 12 weeks
  of PO quantities for each item (POs sorted by order_date descending).
  If no history exists the reorder_level × 2 is used as a baseline.

* Payment terms: mapped from payment_terms_days
    30  → net_30
    45  → net_60 (closest standard)
    60  → net_60
    90+ → net_90
    0   → prepaid (assumption)
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Dict, List, Optional, Tuple

from app.models.demand import DemandPeriod, SKUDemand
from app.models.pricing import PricingEntry
from app.models.purchase_order import POLineItem, POStatus, PurchaseOrder
from app.models.supplier import PaymentTerms, Supplier, SupplierStatus, TieredPrice

logger = logging.getLogger(__name__)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _map_payment_terms(days: int) -> PaymentTerms:
    if days == 0:
        return PaymentTerms.prepaid
    if days <= 30:
        return PaymentTerms.net_30
    if days <= 60:
        return PaymentTerms.net_60
    return PaymentTerms.net_90


def _map_status(status: str) -> SupplierStatus:
    s = (status or "").lower()
    if s == "active":
        return SupplierStatus.active
    if s == "inactive":
        return SupplierStatus.inactive
    return SupplierStatus.at_risk


def _reliability_score(vendor: dict) -> float:
    """Derive a 0-100 reliability score from Nova vendor fields."""
    criticality = (vendor.get("criticality") or "medium").lower()
    base = {"high": 88, "medium": 74, "low": 60}.get(criticality, 74)
    # Early-pay discount → slightly more reliable partner
    if (vendor.get("early_pay_discount_pct") or 0) > 0:
        base = min(100, base + 4)
    # Late penalty → flag as slightly less reliable
    if (vendor.get("late_penalty_pct_per_month") or 0) > 1:
        base = max(0, base - 4)
    return float(base)


def _map_po_status(nova_status: str) -> POStatus:
    mapping = {
        "open":      POStatus.confirmed,
        "received":  POStatus.delivered,
        "cancelled": POStatus.cancelled,
        "draft":     POStatus.draft,
    }
    return mapping.get((nova_status or "").lower(), POStatus.confirmed)


# ── Core transforms ───────────────────────────────────────────────────────────

def transform_vendors(
    nova_vendors: List[dict],
    po_history: List[dict],        # needed for capacity / MOQ estimation
) -> List[Supplier]:
    """Convert Nova vendor list → Supplier list."""

    # Pre-compute per-vendor stats from PO history
    vendor_stats: Dict[str, dict] = defaultdict(lambda: {
        "order_qtys": [],      # all single-order quantities seen
        "weekly_max": 0,       # max qty in a single PO week
    })

    for po in po_history:
        vid = po.get("vendor_id", "")
        if not vid:
            continue
        po_total_qty = sum(i.get("qty", 0) for i in (po.get("items") or []))
        vendor_stats[vid]["order_qtys"].append(po_total_qty)
        if po_total_qty > vendor_stats[vid]["weekly_max"]:
            vendor_stats[vid]["weekly_max"] = po_total_qty

    suppliers: List[Supplier] = []
    for v in nova_vendors:
        vid  = v.get("id", "")
        stat = vendor_stats.get(vid, {"order_qtys": [], "weekly_max": 0})

        weekly_cap = max(500, stat["weekly_max"] * 3)
        moq = min(stat["order_qtys"]) if stat["order_qtys"] else 1
        moq = max(1, int(moq * 0.5))   # take half the smallest observed order

        # Simple 2-tier pricing from inventory purchase_price — filled in later
        # by transform_pricing; placeholder here keeps the model valid
        suppliers.append(Supplier(
            id=vid,
            name=v.get("name", vid),
            status=_map_status(v.get("status", "active")),
            reliability_score=_reliability_score(v),
            lead_time_days=14,            # default; overridden per-item in demand
            weekly_capacity=int(weekly_cap),
            moq=int(moq),
            max_order_qty=0,              # unlimited
            location=v.get("state", ""),
            logistics_cost_per_unit=0.0,  # included in purchase_price
            payment_terms=_map_payment_terms(v.get("payment_terms_days") or 30),
            tiered_pricing=[],            # simple flat pricing used
            contact_email=v.get("email", ""),
            notes=f"Category: {v.get('category','')} | GST: {v.get('gst_number','N/A')}",
        ))

    logger.info("Transformed %d vendors → Supplier objects", len(suppliers))
    return suppliers


def transform_inventory_to_demands(
    nova_items: List[dict],
    po_history: List[dict],
    planning_weeks: int = 6,
) -> List[SKUDemand]:
    """
    Convert Nova inventory items → SKUDemand with a 6-week demand forecast.

    Forecast logic:
      1. Group POs by item_id, sort by order_date descending.
      2. Sum quantities per ISO week for the last 12 PO-weeks.
      3. Take the last `planning_weeks` averages as the forecast.
      4. Fallback: reorder_level × 3 if no PO history exists.
    """
    # Build item_id → weekly qty history from PO history
    item_weekly: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for po in po_history:
        order_date_str = po.get("order_date") or po.get("created_at", "")[:10]
        try:
            od = date.fromisoformat(order_date_str)
            week_label = f"W{od.isocalendar()[1]:02d}-{od.year}"
        except (ValueError, TypeError):
            continue

        for item in (po.get("items") or []):
            iid = item.get("item_id")
            if iid:
                item_weekly[iid][week_label] += item.get("qty", 0)

    demands: List[SKUDemand] = []

    for itm in nova_items:
        iid  = itm.get("id", "")
        name = itm.get("name", iid)
        sku  = itm.get("sku", iid)

        # Get the most recent N weeks that have orders for this item
        history = item_weekly.get(iid, {})
        sorted_weeks = sorted(history.keys(), reverse=True)

        if sorted_weeks:
            recent = sorted_weeks[:12]          # up to 12 recent weeks
            avg_weekly = mean(history[w] for w in recent)
        else:
            # Fallback: use reorder_level * 3 as weekly demand proxy
            avg_weekly = max(10, (itm.get("reorder_level") or 10) * 3)

        # Build 6 synthetic forecast periods with mild growth trend
        periods: List[DemandPeriod] = []
        for i in range(planning_weeks):
            # Slight upward trend: +2% per week
            qty = max(1, round(avg_weekly * (1.0 + i * 0.02)))
            periods.append(DemandPeriod(period=f"W{i+1}", quantity=qty))

        # Safety stock = 20% of average weekly demand, min 5
        safety_stock = max(5, round(avg_weekly * 0.20))

        # Derive category from HSN code if no direct field
        hsn = itm.get("hsn_code", "")
        category = _hsn_to_category(hsn) or itm.get("unit", "units")

        demands.append(SKUDemand(
            sku_id=iid,
            sku_name=name,
            category=category,
            unit_of_measure=itm.get("unit", "units"),
            periods=periods,
            safety_stock=safety_stock,
            total_demand=sum(p.quantity for p in periods),
        ))

    logger.info("Transformed %d inventory items → SKUDemand objects", len(demands))
    return demands


def transform_pricing(
    nova_items: List[dict],
    nova_vendors: List[dict],
    po_history: List[dict],
) -> List[PricingEntry]:
    """
    Build PricingEntry list from Nova PO history.

    For each (vendor_id, item_id) pair observed in PO history:
      - base_price = weighted average of unit_price across all POs
      - logistics_cost = 0 (included in Indian supplier quotes)

    Items with no PO history get a base_price from the
    inventory purchase_price field.
    """
    # Accumulate prices per (vendor_id, item_id)
    price_acc: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    qty_acc:   Dict[Tuple[str, str], List[int]]   = defaultdict(list)

    for po in po_history:
        vid = po.get("vendor_id", "")
        for item in (po.get("items") or []):
            iid = item.get("item_id")
            if iid and vid:
                price_acc[(vid, iid)].append(float(item.get("unit_price", 0)))
                qty_acc[(vid, iid)].append(int(item.get("qty", 1)))

    entries: List[PricingEntry] = []

    # 1. From PO history
    for (vid, iid), prices in price_acc.items():
        qtys   = qty_acc[(vid, iid)]
        # Weighted average by quantity
        total_qty  = sum(qtys)
        wavg_price = sum(p * q for p, q in zip(prices, qtys)) / total_qty if total_qty else mean(prices)

        entries.append(PricingEntry(
            supplier_id=vid,
            sku_id=iid,
            base_price=round(wavg_price, 2),
            logistics_cost=0.0,
            effective_price=round(wavg_price, 2),
        ))

    # 2. For items that have a primary_vendor but no PO history,
    #    use the inventory purchase_price as base
    seen = {(e.supplier_id, e.sku_id) for e in entries}
    item_map = {i["id"]: i for i in nova_items}

    for itm in nova_items:
        iid  = itm.get("id")
        pvid = itm.get("primary_vendor_id")
        if iid and pvid and (pvid, iid) not in seen:
            purchase_price = float(itm.get("purchase_price") or 0)
            if purchase_price > 0:
                entries.append(PricingEntry(
                    supplier_id=pvid,
                    sku_id=iid,
                    base_price=round(purchase_price, 2),
                    logistics_cost=0.0,
                    effective_price=round(purchase_price, 2),
                ))

    logger.info("Built %d PricingEntry objects from Nova data", len(entries))
    return entries


def transform_purchase_orders(
    nova_pos: List[dict],
    vendor_map: Dict[str, str],    # vendor_id → vendor_name
    item_map:   Dict[str, dict],   # item_id   → inventory item dict
) -> List[PurchaseOrder]:
    """Convert Nova purchase orders → PurchaseOrder objects (most recent 50)."""

    # Sort by created_at descending, take most recent 50
    sorted_pos = sorted(
        nova_pos,
        key=lambda p: p.get("created_at", ""),
        reverse=True,
    )[:50]

    result: List[PurchaseOrder] = []

    for po in sorted_pos:
        vid      = po.get("vendor_id", "")
        sup_name = vendor_map.get(vid, vid)
        po_num   = po.get("po_number", po.get("id", ""))

        line_items: List[POLineItem] = []
        for li in (po.get("items") or []):
            iid  = li.get("item_id")
            itm  = item_map.get(iid, {}) if iid else {}
            qty  = int(li.get("qty", 0))
            uprice = float(li.get("unit_price", 0))
            line_items.append(POLineItem(
                sku_id=iid or "UNKNOWN",
                sku_name=itm.get("name", iid or "Unknown item"),
                quantity=qty,
                unit_price=uprice,
                line_total=round(qty * uprice, 2),
            ))

        # Parse promised_date → delivery date
        promised = po.get("promised_date") or po.get("order_date")
        try:
            delivery = date.fromisoformat(promised)
        except (ValueError, TypeError):
            delivery = date.today() + timedelta(days=14)

        result.append(PurchaseOrder(
            po_number=po_num,
            supplier_id=vid,
            supplier_name=sup_name,
            line_items=line_items,
            order_value=round(float(po.get("total_amount", 0)), 2),
            expected_delivery=delivery,
            status=_map_po_status(po.get("status", "open")),
            notes=f"Channel: {po.get('channel','N/A')}",
        ))

    logger.info("Transformed %d Nova POs → PurchaseOrder objects", len(result))
    return result


# ── HSN → category lookup ─────────────────────────────────────────────────────

_HSN_MAP = {
    "84": "Machinery & Equipment",
    "85": "Electronics",
    "72": "Metals",
    "73": "Metals",
    "74": "Metals",
    "52": "Textiles",
    "62": "Apparel",
    "64": "Footwear",
    "69": "Construction Materials",
    "76": "Metals",
    "63": "Textiles",
    "08": "Food Commodities",
    "09": "Food Commodities",
    "10": "Food Commodities",
    "25": "Construction Materials",
    "39": "Plastics",
    "48": "Paper and Stationery",
    "94": "Furniture",
    "99": "Services",
    "38": "Healthcare & Safety",
    "30": "Healthcare & Safety",
}

def _hsn_to_category(hsn: str) -> str:
    if not hsn:
        return "General"
    prefix2 = hsn[:2]
    prefix4 = hsn[:4]
    return _HSN_MAP.get(prefix4) or _HSN_MAP.get(prefix2) or "General"


# ── Master transform ──────────────────────────────────────────────────────────

def build_dataset(
    nova_vendors:  List[dict],
    nova_inventory: List[dict],
    nova_pos:      List[dict],
) -> dict:
    """
    Run all transforms and return a single dict with all converted objects.
    Called by nova_seed.py on startup and on /api/nova/sync.
    """
    suppliers = transform_vendors(nova_vendors, nova_pos)
    demands   = transform_inventory_to_demands(nova_inventory, nova_pos)
    pricing   = transform_pricing(nova_inventory, nova_vendors, nova_pos)

    vendor_map = {v["id"]: v["name"] for v in nova_vendors}
    item_map   = {i["id"]: i for i in nova_inventory}
    orders     = transform_purchase_orders(nova_pos, vendor_map, item_map)

    logger.info(
        "Nova dataset built: %d suppliers, %d SKUs, %d pricing entries, %d POs",
        len(suppliers), len(demands), len(pricing), len(orders),
    )
    return {
        "suppliers": suppliers,
        "demands":   demands,
        "pricing":   pricing,
        "orders":    orders,
        "vendor_map": vendor_map,
        "item_map":   item_map,
    }
