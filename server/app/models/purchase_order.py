"""
Purchase Order models — mirrors the PO table shown in the frontend.
"""
from datetime import date
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class POStatus(str, Enum):
    draft = "Draft"
    confirmed = "Confirmed"
    in_transit = "In transit"
    at_risk = "At risk"
    delivered = "Delivered"
    cancelled = "Cancelled"


class POLineItem(BaseModel):
    sku_id: str
    sku_name: str
    quantity: int = Field(..., ge=1)
    unit_price: float = Field(..., gt=0)
    line_total: float


class PurchaseOrder(BaseModel):
    po_number: str = Field(..., description="e.g. 'PO-10482'")
    supplier_id: str
    supplier_name: str
    line_items: List[POLineItem]
    order_value: float
    expected_delivery: date
    status: POStatus = POStatus.draft
    created_at: Optional[str] = None
    notes: Optional[str] = None

    @property
    def items_summary(self) -> str:
        return f"{len(self.line_items)} SKUs"


class PurchaseOrderListResponse(BaseModel):
    orders: List[PurchaseOrder]
    total: int
    total_value: float


class CreatePORequest(BaseModel):
    """Generate purchase orders from an optimization result."""
    allocations: List[dict]   # AllocationLine dicts from OptimizationResponse
    supplier_ids: Optional[List[str]] = None  # filter to specific suppliers
