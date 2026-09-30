"""
Pricing and Total Cost of Ownership (TCO) models.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class PricingEntry(BaseModel):
    """Unit cost for a specific supplier–SKU combination."""
    supplier_id: str
    sku_id: str
    base_price: float = Field(..., gt=0, description="Base unit price (USD)")
    logistics_cost: float = Field(default=0.0, ge=0, description="Per-unit logistics cost (USD)")
    # Effective price after applying the best matching tier
    effective_price: Optional[float] = None

    @property
    def tco_per_unit(self) -> float:
        """Total Cost of Ownership = effective (or base) price + logistics."""
        price = self.effective_price if self.effective_price is not None else self.base_price
        return price + self.logistics_cost


class PricingRequest(BaseModel):
    entries: List[PricingEntry]


class PricingResponse(BaseModel):
    entries: List[PricingEntry]
    total_entries: int


class SpendBreakdown(BaseModel):
    """Aggregated spend per supplier — used by the dashboard pie chart."""
    supplier_id: str
    supplier_name: str
    name: str = ""          # alias of supplier_name for Recharts
    total_spend: float
    spend_pct: float = Field(..., ge=0, le=100)
    value: float = 0.0      # alias of spend_pct for Recharts PieChart
    color: Optional[str] = None
