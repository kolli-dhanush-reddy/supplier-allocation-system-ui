"""
/api/suppliers  — full CRUD + capacity endpoint.
Reads from nova_seed.SUPPLIERS (populated at startup from Nova API).
Writes (create/update/delete) mutate the same live list directly.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_api_key
from app.models.supplier import (
    CapacityListResponse,
    Supplier,
    SupplierCapacity,
    SupplierListResponse,
    SupplierStatus,
    SupplierUpsert,
    TieredPrice,
    PaymentTerms,
)
from app.services import nova_seed

router = APIRouter(prefix="/api/suppliers", tags=["Suppliers"])
Auth = Annotated[None, Depends(verify_api_key)]


def _store() -> list:
    """Live supplier list — always reflects the latest nova_seed state."""
    return nova_seed.SUPPLIERS


def _find(supplier_id: str) -> Supplier | None:
    return next((s for s in _store() if s.id == supplier_id), None)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("", response_model=SupplierListResponse)
async def list_suppliers(_: Auth) -> SupplierListResponse:
    """Return all suppliers."""
    store = _store()
    return SupplierListResponse(suppliers=store, total=len(store))


# ── Capacity — must be before /{supplier_id} to avoid route conflict ──────────

@router.get("/capacity/all", response_model=CapacityListResponse)
async def list_capacities(_: Auth) -> CapacityListResponse:
    """Capacity utilization snapshot derived from current PO store."""
    from app.services.nova_seed import PURCHASE_ORDERS

    allocated: dict[str, int] = {}
    for po in PURCHASE_ORDERS:
        allocated[po.supplier_id] = allocated.get(po.supplier_id, 0) + sum(
            li.quantity for li in po.line_items
        )

    capacities = [
        SupplierCapacity(
            supplier_id=sup.id,
            supplier_name=sup.name,
            allocated_pct=round(
                min(100.0, allocated.get(sup.id, 0) / max(sup.weekly_capacity, 1) * 100), 1
            ),
            available_pct=round(
                max(0.0, 100.0 - allocated.get(sup.id, 0) / max(sup.weekly_capacity, 1) * 100), 1
            ),
            weekly_capacity=sup.weekly_capacity,
            allocated_units=allocated.get(sup.id, 0),
        )
        for sup in _store()
    ]
    return CapacityListResponse(capacities=capacities)


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, _: Auth) -> Supplier:
    sup = _find(supplier_id)
    if sup is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Supplier '{supplier_id}' not found.")
    return sup


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", response_model=Supplier, status_code=status.HTTP_201_CREATED)
async def create_supplier(payload: SupplierUpsert, _: Auth) -> Supplier:
    """Create a new supplier and add it to the live store."""
    new_id = payload.id or f"SUP-{str(uuid.uuid4())[:6].upper()}"
    if _find(new_id):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"Supplier '{new_id}' already exists.")

    sup = Supplier(
        id=new_id,
        name=payload.name,
        status=SupplierStatus(payload.status) if payload.status else SupplierStatus.active,
        reliability_score=payload.reliability_score or 80.0,
        lead_time_days=payload.lead_time_days or 7,
        weekly_capacity=payload.weekly_capacity or 1000,
        moq=payload.moq or 0,
        max_order_qty=payload.max_order_qty or 0,
        location=payload.location,
        logistics_cost_per_unit=payload.logistics_cost_per_unit or 0.0,
        payment_terms=PaymentTerms(payload.payment_terms) if payload.payment_terms else PaymentTerms.net_30,
        tiered_pricing=[TieredPrice(**t) if isinstance(t, dict) else t for t in (payload.tiered_pricing or [])],
        contact_email=payload.contact_email,
        notes=payload.notes,
    )
    nova_seed.SUPPLIERS.append(sup)
    return sup


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{supplier_id}", response_model=Supplier)
async def update_supplier(supplier_id: str, payload: SupplierUpsert, _: Auth) -> Supplier:
    """Full update of a supplier record."""
    idx = next((i for i, s in enumerate(_store()) if s.id == supplier_id), None)
    if idx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Supplier '{supplier_id}' not found.")

    updated = Supplier(
        id=supplier_id,
        name=payload.name,
        status=SupplierStatus(payload.status) if payload.status else SupplierStatus.active,
        reliability_score=payload.reliability_score or 80.0,
        lead_time_days=payload.lead_time_days or 7,
        weekly_capacity=payload.weekly_capacity or 1000,
        moq=payload.moq or 0,
        max_order_qty=payload.max_order_qty or 0,
        location=payload.location,
        logistics_cost_per_unit=payload.logistics_cost_per_unit or 0.0,
        payment_terms=PaymentTerms(payload.payment_terms) if payload.payment_terms else PaymentTerms.net_30,
        tiered_pricing=[TieredPrice(**t) if isinstance(t, dict) else t for t in (payload.tiered_pricing or [])],
        contact_email=payload.contact_email,
        notes=payload.notes,
    )
    nova_seed.SUPPLIERS[idx] = updated
    return updated


@router.patch("/{supplier_id}/status", response_model=Supplier)
async def update_supplier_status(supplier_id: str, new_status: SupplierStatus, _: Auth) -> Supplier:
    """Quick status update."""
    sup = _find(supplier_id)
    if sup is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Supplier '{supplier_id}' not found.")
    sup.status = new_status
    return sup


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(supplier_id: str, _: Auth) -> None:
    """Remove a supplier from the live store."""
    before = len(nova_seed.SUPPLIERS)
    nova_seed.SUPPLIERS[:] = [s for s in nova_seed.SUPPLIERS if s.id != supplier_id]
    if len(nova_seed.SUPPLIERS) == before:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=f"Supplier '{supplier_id}' not found.")
