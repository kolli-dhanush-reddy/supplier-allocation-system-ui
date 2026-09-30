"""
Demand planning Pydantic models.
These mirror the TypeScript Demand types in src/types/procurement.ts.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class DemandPeriod(BaseModel):
    """Demand for a single SKU in a single time period (week)."""
    period: str = Field(..., description="Period label, e.g. 'W1', 'W2', 'Oct-2026'")
    quantity: int = Field(..., ge=0, description="Units required in this period")


class SKUDemand(BaseModel):
    """Aggregated demand record for one SKU across multiple periods."""
    sku_id: str = Field(..., description="Stock Keeping Unit identifier, e.g. 'SKU-001'")
    sku_name: str
    category: Optional[str] = None
    unit_of_measure: str = Field(default="units")
    periods: List[DemandPeriod]
    # Convenience totals computed by the service layer
    total_demand: Optional[int] = None
    safety_stock: int = Field(default=0, ge=0, description="Buffer stock units")


class DemandRequest(BaseModel):
    """Payload for posting or updating demand data."""
    demands: List[SKUDemand]
    planning_horizon_weeks: int = Field(default=6, ge=1, le=52)


class DemandResponse(BaseModel):
    demands: List[SKUDemand]
    planning_horizon_weeks: int
    total_skus: int
    total_units: int
