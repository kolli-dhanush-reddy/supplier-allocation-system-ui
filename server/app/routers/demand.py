"""
/api/demand  — demand planning endpoints.
Reads from nova_seed.DEMANDS (populated from Nova API at startup).
"""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import verify_api_key
from app.models.demand import DemandRequest, DemandResponse, SKUDemand
from app.services import nova_seed

router = APIRouter(prefix="/api/demand", tags=["Demand"])
Auth = Annotated[None, Depends(verify_api_key)]


def _store() -> list:
    return nova_seed.DEMANDS


@router.get("", response_model=DemandResponse)
async def get_demand(_: Auth) -> DemandResponse:
    """Return current demand plan across all SKUs and periods."""
    store = _store()
    total_units = sum(p.quantity for d in store for p in d.periods)
    return DemandResponse(
        demands=store,
        planning_horizon_weeks=6,
        total_skus=len(store),
        total_units=total_units,
    )


@router.post("", response_model=DemandResponse)
async def upsert_demand(payload: DemandRequest, _: Auth) -> DemandResponse:
    """Upsert demand entries — overwrites existing SKU IDs."""
    incoming_ids = {d.sku_id for d in payload.demands}
    kept = [d for d in nova_seed.DEMANDS if d.sku_id not in incoming_ids]
    nova_seed.DEMANDS[:] = kept + list(payload.demands)

    total_units = sum(p.quantity for d in nova_seed.DEMANDS for p in d.periods)
    return DemandResponse(
        demands=nova_seed.DEMANDS,
        planning_horizon_weeks=payload.planning_horizon_weeks,
        total_skus=len(nova_seed.DEMANDS),
        total_units=total_units,
    )
