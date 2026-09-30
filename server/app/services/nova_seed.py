"""
Nova Seed — Live Data Store
============================
Single source of truth for all runtime data.
On startup it fetches from Nova API and populates the in-memory store.
Every router imports from here instead of the old seed_data.py.

Fallback: if Nova API is unreachable at startup, falls back to the
static seed_data.py so the app still starts and is usable offline.

Thread safety: all mutations happen through replace_dataset() which
does an atomic swap of the module-level lists. Python's GIL makes
simple list reassignment safe for our use-case.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import List, Optional

from app.models.demand import SKUDemand
from app.models.pricing import PricingEntry
from app.models.purchase_order import PurchaseOrder
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

# ── Live store (populated at startup) ────────────────────────────────────────
SUPPLIERS:       List[Supplier]      = []
DEMANDS:         List[SKUDemand]     = []
PRICING:         List[PricingEntry]  = []
PURCHASE_ORDERS: List[PurchaseOrder] = []

# Metadata
_data_source:    str            = "unloaded"   # "nova" | "fallback" | "unloaded"
_last_synced_at: Optional[str]  = None
_sync_lock                      = threading.Lock()


# ── Internal helpers ──────────────────────────────────────────────────────────

def _load_from_nova() -> bool:
    """
    Fetch all pages from Nova API, transform to Pydantic models,
    and swap the module-level lists atomically.
    Returns True on success, False on any error.
    """
    try:
        from app.services import nova_client, nova_transform

        logger.info("Loading data from Nova API…")
        vendors   = nova_client.fetch_vendors()
        inventory = nova_client.fetch_inventory()
        pos       = nova_client.fetch_purchase_orders()

        dataset = nova_transform.build_dataset(vendors, inventory, pos)

        replace_dataset(
            suppliers       = dataset["suppliers"],
            demands         = dataset["demands"],
            pricing         = dataset["pricing"],
            purchase_orders = dataset["orders"],
            source          = "nova",
        )
        return True

    except Exception as exc:
        logger.error("Nova API load failed: %s", exc, exc_info=True)
        return False


def _load_fallback() -> None:
    """Load static seed data as a fallback."""
    try:
        from app.services import seed_data as sd

        replace_dataset(
            suppliers       = list(sd.SUPPLIERS),
            demands         = list(sd.DEMANDS),
            pricing         = list(sd.PRICING),
            purchase_orders = list(sd.PURCHASE_ORDERS),
            source          = "fallback",
        )
        logger.warning("⚠  Using FALLBACK static seed data (Nova API unavailable)")
    except Exception as exc:
        logger.error("Fallback seed load also failed: %s", exc)


# ── Public API ────────────────────────────────────────────────────────────────

def replace_dataset(
    suppliers:       List[Supplier],
    demands:         List[SKUDemand],
    pricing:         List[PricingEntry],
    purchase_orders: List[PurchaseOrder],
    source:          str = "nova",
) -> None:
    """Atomically replace all four collections."""
    global SUPPLIERS, DEMANDS, PRICING, PURCHASE_ORDERS
    global _data_source, _last_synced_at

    with _sync_lock:
        SUPPLIERS       = suppliers
        DEMANDS         = demands
        PRICING         = pricing
        PURCHASE_ORDERS = purchase_orders
        _data_source    = source
        _last_synced_at = datetime.utcnow().isoformat() + "Z"

    logger.info(
        "Dataset replaced — source=%s  suppliers=%d  skus=%d  pricing=%d  pos=%d",
        source, len(suppliers), len(demands), len(pricing), len(purchase_orders),
    )


def initialise() -> None:
    """
    Called once at app startup.
    Tries Nova API first; falls back to static seed data on failure.
    """
    if not _load_from_nova():
        _load_fallback()


def sync() -> dict:
    """
    Force a fresh pull from Nova API (called by /api/nova/sync).
    Returns a status dict.
    """
    success = _load_from_nova()
    return {
        "success":        success,
        "data_source":    _data_source,
        "last_synced_at": _last_synced_at,
        "suppliers":      len(SUPPLIERS),
        "skus":           len(DEMANDS),
        "pricing_pairs":  len(PRICING),
        "purchase_orders":len(PURCHASE_ORDERS),
        "message": "Synced from Nova API" if success else "Nova API unreachable — still on previous data",
    }


def status() -> dict:
    """Return current store metadata without triggering a sync."""
    return {
        "data_source":    _data_source,
        "last_synced_at": _last_synced_at,
        "suppliers":      len(SUPPLIERS),
        "skus":           len(DEMANDS),
        "pricing_pairs":  len(PRICING),
        "purchase_orders":len(PURCHASE_ORDERS),
    }
