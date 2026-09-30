"""
Optimization request / response models.
Covers the four strategies plus scenario simulation.
"""
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.supplier import Supplier
from app.models.demand import SKUDemand
from app.models.pricing import PricingEntry


class OptimizationStrategy(str, Enum):
    cost_minimization = "cost_minimization"
    lead_time_minimization = "lead_time_minimization"
    balanced_risk = "balanced_risk"
    dual_sourcing = "dual_sourcing"


class OptimizationStatus(str, Enum):
    optimal = "optimal"
    infeasible = "infeasible"
    unbounded = "unbounded"
    error = "error"


# ── Request ───────────────────────────────────────────────────────────────────

class OptimizationRequest(BaseModel):
    """
    Full payload sent to POST /api/optimize.
    Embed suppliers, demand, and pricing inline so the solver is self-contained.
    Omit any field to fall back to the live Nova API dataset on the server.
    """
    strategy: OptimizationStrategy = OptimizationStrategy.cost_minimization
    suppliers: Optional[List[Supplier]] = None
    demands:   Optional[List[SKUDemand]] = None
    pricing:   Optional[List[PricingEntry]] = None
    # Dual-sourcing: minimum fraction of demand that must come from a 2nd supplier
    dual_source_min_fraction: float = Field(
        default=0.2, ge=0.0, le=1.0,
        description="For dual_sourcing strategy: min share for secondary supplier"
    )
    # Balanced-risk: max allocation fraction allowed for any single supplier
    max_single_supplier_fraction: float = Field(
        default=0.7, ge=0.1, le=1.0,
        description="For balanced_risk strategy: cap per supplier"
    )


# ── Per-allocation result ─────────────────────────────────────────────────────

class AllocationLine(BaseModel):
    """One row in the optimal allocation plan."""
    supplier_id: str
    supplier_name: str
    sku_id: str
    sku_name: str
    period: str
    quantity: int
    unit_cost: float
    logistics_cost: float
    total_cost: float
    lead_time_days: int


# ── Summary metrics ───────────────────────────────────────────────────────────

class OptimizationSummary(BaseModel):
    total_cost: float
    total_units_allocated: int
    demand_fulfillment_pct: float = Field(..., ge=0, le=100)
    weighted_lead_time_days: float
    supplier_count_used: int
    cost_savings_vs_baseline: Optional[float] = None


# ── Response ──────────────────────────────────────────────────────────────────

class OptimizationResponse(BaseModel):
    status: OptimizationStatus
    strategy: OptimizationStrategy
    summary: OptimizationSummary
    allocations: List[AllocationLine]
    # Spend breakdown per supplier (for pie chart)
    spend_by_supplier: List[Dict]
    # Capacity utilization per supplier (for bar chart)
    capacity_utilization: List[Dict]
    # Delivery timeline per supplier per period (for line chart)
    delivery_timeline: List[Dict]
    solver_message: Optional[str] = None


# ── Scenario simulation ───────────────────────────────────────────────────────

class DisruptionType(str, Enum):
    supplier_disruption = "supplier_disruption"   # supplier goes offline
    price_inflation = "price_inflation"            # price multiplier applied
    demand_surge = "demand_surge"                  # demand multiplier applied


class ScenarioRequest(BaseModel):
    """Scenario simulation — runs optimization under a what-if condition."""
    base_request: OptimizationRequest
    disruption_type: DisruptionType
    # For supplier_disruption: which supplier IDs are disrupted
    disrupted_supplier_ids: List[str] = Field(default_factory=list)
    # For price_inflation: price multiplier (e.g. 1.15 = +15%)
    price_inflation_factor: float = Field(default=1.0, ge=1.0)
    # For demand_surge: demand multiplier (e.g. 1.3 = +30%)
    demand_surge_factor: float = Field(default=1.0, ge=1.0)
    scenario_name: Optional[str] = "Unnamed scenario"


class ScenarioResponse(BaseModel):
    scenario_name: str
    disruption_type: DisruptionType
    baseline: OptimizationResponse
    simulated: OptimizationResponse
    # Delta metrics vs baseline
    cost_delta: float
    cost_delta_pct: float
    fulfillment_delta_pct: float
    lead_time_delta_days: float
    risk_assessment: str   # human-readable summary of the impact


# ── Strategy comparison ───────────────────────────────────────────────────────

class StrategySummaryRow(BaseModel):
    """One row in the strategy comparison table."""
    strategy: OptimizationStrategy
    status: OptimizationStatus
    total_cost: float
    demand_fulfillment_pct: float
    weighted_lead_time_days: float
    supplier_count_used: int
    total_units_allocated: int


class StrategyComparisonResponse(BaseModel):
    rows: List[StrategySummaryRow]
    best_cost_strategy: OptimizationStrategy
    best_lead_time_strategy: OptimizationStrategy
    best_fulfillment_strategy: OptimizationStrategy
