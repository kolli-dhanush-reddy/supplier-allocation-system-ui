"""
/api/pricing  — pricing matrix and TCO endpoints.
Reads from nova_seed.PRICING (populated from Nova API at startup).
"""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import verify_api_key
from app.models.pricing import PricingEntry, PricingRequest, PricingResponse, SpendBreakdown
from app.services import nova_seed

router = APIRouter(prefix="/api/pricing", tags=["Pricing"])
Auth = Annotated[None, Depends(verify_api_key)]

COLORS = ["#2563eb", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"]


@router.get("", response_model=PricingResponse)
async def get_pricing(_: Auth) -> PricingResponse:
    """Return full pricing matrix (all supplier × SKU combinations)."""
    return PricingResponse(entries=nova_seed.PRICING, total_entries=len(nova_seed.PRICING))


@router.post("", response_model=PricingResponse)
async def upsert_pricing(payload: PricingRequest, _: Auth) -> PricingResponse:
    """Upsert pricing entries (matched on supplier_id + sku_id)."""
    index = {(e.supplier_id, e.sku_id): e for e in nova_seed.PRICING}
    for entry in payload.entries:
        index[(entry.supplier_id, entry.sku_id)] = entry
    nova_seed.PRICING[:] = list(index.values())
    return PricingResponse(entries=nova_seed.PRICING, total_entries=len(nova_seed.PRICING))


@router.get("/spend-breakdown", response_model=list[SpendBreakdown])
async def spend_breakdown(_: Auth) -> list[SpendBreakdown]:
    """Spend % per supplier derived from live purchase orders."""
    sup_map = {s.id: s for s in nova_seed.SUPPLIERS}
    spend: dict[str, float] = {}
    for po in nova_seed.PURCHASE_ORDERS:
        spend[po.supplier_id] = spend.get(po.supplier_id, 0.0) + po.order_value

    total = sum(spend.values()) or 1.0
    return [
        SpendBreakdown(
            supplier_id=sid,
            supplier_name=sup_map[sid].name if sid in sup_map else sid,
            name=sup_map[sid].name if sid in sup_map else sid,
            total_spend=round(amt, 2),
            spend_pct=round(amt / total * 100, 1),
            value=round(amt / total * 100, 1),
            color=COLORS[i % len(COLORS)],
        )
        for i, (sid, amt) in enumerate(spend.items())
        if amt > 0
    ]
