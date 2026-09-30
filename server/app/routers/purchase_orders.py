"""
/api/purchase-orders  — purchase order CRUD and generation from optimization.
Reads/writes nova_seed.PURCHASE_ORDERS (populated from Nova API at startup).
"""
import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_api_key
from app.models.purchase_order import (
    CreatePORequest,
    POLineItem,
    POStatus,
    PurchaseOrder,
    PurchaseOrderListResponse,
)
from app.services import nova_seed

router = APIRouter(prefix="/api/purchase-orders", tags=["Purchase Orders"])
Auth = Annotated[None, Depends(verify_api_key)]


def _store() -> list:
    """Live PO list — always reflects the latest nova_seed state."""
    return nova_seed.PURCHASE_ORDERS


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=PurchaseOrderListResponse)
async def list_purchase_orders(_: Auth) -> PurchaseOrderListResponse:
    store = _store()
    return PurchaseOrderListResponse(
        orders=store,
        total=len(store),
        total_value=round(sum(po.order_value for po in store), 2),
    )


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{po_number}", response_model=PurchaseOrder)
async def get_purchase_order(po_number: str, _: Auth) -> PurchaseOrder:
    match = next((po for po in _store() if po.po_number == po_number), None)
    if match is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"PO '{po_number}' not found.")
    return match


# ── Generate POs from optimization ───────────────────────────────────────────

@router.post("/generate", response_model=PurchaseOrderListResponse)
async def generate_purchase_orders(payload: CreatePORequest, _: Auth) -> PurchaseOrderListResponse:
    """
    Convert optimization allocation lines into draft purchase orders.
    Groups lines by supplier, creates one PO per supplier, appends to live store.
    """
    sup_map = {s.id: s for s in nova_seed.SUPPLIERS}

    by_supplier: dict[str, list[dict]] = {}
    for line in payload.allocations:
        sid = line.get("supplier_id", "")
        if payload.supplier_ids and sid not in payload.supplier_ids:
            continue
        by_supplier.setdefault(sid, []).append(line)

    new_pos: list[PurchaseOrder] = []
    for sid, lines in by_supplier.items():
        sup = sup_map.get(sid)
        if sup is None:
            continue

        seen_skus: dict[str, POLineItem] = {}
        for line in lines:
            sku_id     = line.get("sku_id", "")
            qty        = int(line.get("quantity", 0))
            unit_price = float(line.get("unit_cost", 0))
            if sku_id in seen_skus:
                existing = seen_skus[sku_id]
                new_qty  = existing.quantity + qty
                seen_skus[sku_id] = POLineItem(
                    sku_id=sku_id,
                    sku_name=existing.sku_name,
                    quantity=new_qty,
                    unit_price=unit_price,
                    line_total=round(new_qty * unit_price, 2),
                )
            else:
                seen_skus[sku_id] = POLineItem(
                    sku_id=sku_id,
                    sku_name=line.get("sku_name", sku_id),
                    quantity=qty,
                    unit_price=unit_price,
                    line_total=round(qty * unit_price, 2),
                )

        po_items    = list(seen_skus.values())
        order_value = round(sum(i.line_total for i in po_items), 2)
        delivery    = date.today() + timedelta(days=sup.lead_time_days)
        po_num      = f"PO-GEN-{str(uuid.uuid4().int)[:5].upper()}"

        po = PurchaseOrder(
            po_number=po_num,
            supplier_id=sid,
            supplier_name=sup.name,
            line_items=po_items,
            order_value=order_value,
            expected_delivery=delivery,
            status=POStatus.draft,
        )
        new_pos.append(po)
        nova_seed.PURCHASE_ORDERS.append(po)

    return PurchaseOrderListResponse(
        orders=new_pos,
        total=len(new_pos),
        total_value=round(sum(po.order_value for po in new_pos), 2),
    )


# ── Status update ─────────────────────────────────────────────────────────────

@router.patch("/{po_number}/status", response_model=PurchaseOrder)
async def update_po_status(po_number: str, new_status: POStatus, _: Auth) -> PurchaseOrder:
    for po in _store():
        if po.po_number == po_number:
            po.status = new_status
            return po
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"PO '{po_number}' not found.")
