"""
Supplier-related Pydantic models.
These mirror the TypeScript Supplier types in src/types/procurement.ts.
"""
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SupplierUpsert(BaseModel):
    """Payload for creating or updating a supplier (id optional on create)."""
    id: Optional[str] = None
    name: str
    status: "SupplierStatus" = None          # resolved below after class def
    reliability_score: float = Field(default=80.0, ge=0, le=100)
    lead_time_days: int = Field(default=7, ge=0)
    weekly_capacity: int = Field(default=1000, ge=0)
    moq: int = Field(default=0, ge=0)
    max_order_qty: int = Field(default=0, ge=0)
    location: Optional[str] = None
    logistics_cost_per_unit: float = Field(default=0.0, ge=0)
    payment_terms: Optional[str] = "net_30"
    tiered_pricing: List["TieredPrice"] = Field(default_factory=list)
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class SupplierStatus(str, Enum):
    active = "active"
    at_risk = "at_risk"
    inactive = "inactive"


class TieredPrice(BaseModel):
    """A single price tier: price_per_unit applies when quantity >= min_qty."""
    min_qty: int = Field(..., ge=0, description="Minimum quantity for this tier")
    price_per_unit: float = Field(..., gt=0, description="Unit price at this tier (USD)")


class PaymentTerms(str, Enum):
    net_30  = "net_30"
    net_60  = "net_60"
    net_90  = "net_90"
    prepaid = "prepaid"
    cod     = "cod"          # cash on delivery


class Supplier(BaseModel):
    """A supplier that can fulfill SKU demand."""
    id: str = Field(..., description="Unique supplier identifier, e.g. 'SUP-001'")
    name: str
    status: SupplierStatus = SupplierStatus.active
    reliability_score: float = Field(..., ge=0, le=100, description="0–100 reliability score")
    lead_time_days: int = Field(..., ge=0, description="Average lead time in days")
    # Capacity per week (units across all SKUs combined)
    weekly_capacity: int = Field(..., ge=0)
    # Minimum order quantity per SKU per order
    moq: int = Field(default=0, ge=0, description="Minimum order quantity")
    # Maximum order quantity per SKU per period (0 = unlimited)
    max_order_qty: int = Field(default=0, ge=0, description="Max order quantity per SKU per period; 0 = unlimited")
    location: Optional[str] = None
    # Logistics cost per unit shipped (USD)
    logistics_cost_per_unit: float = Field(default=0.0, ge=0)
    # Payment terms
    payment_terms: PaymentTerms = PaymentTerms.net_30
    # Tiered pricing list (sorted ascending by min_qty)
    tiered_pricing: List[TieredPrice] = Field(default_factory=list)
    # Notes / contact info
    contact_email: Optional[str] = None
    notes: Optional[str] = None


class SupplierCapacity(BaseModel):
    """Current capacity snapshot for a supplier."""
    supplier_id: str
    supplier_name: str
    allocated_pct: float = Field(..., ge=0, le=100, description="% of capacity allocated")
    available_pct: float = Field(..., ge=0, le=100, description="% of capacity still available")
    weekly_capacity: int
    allocated_units: int


class SupplierListResponse(BaseModel):
    suppliers: List[Supplier]
    total: int


class CapacityListResponse(BaseModel):
    capacities: List[SupplierCapacity]
