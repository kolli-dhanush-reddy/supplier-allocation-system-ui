"""
/api/optimize  — run MILP optimization.
/api/scenarios/simulate  — run scenario disruption simulation.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import verify_api_key
from app.models.optimization import (
    OptimizationRequest,
    OptimizationResponse,
    OptimizationStrategy,
    ScenarioRequest,
    ScenarioResponse,
    StrategyComparisonResponse,
)
from app.services import optimizer, scenario, nova_seed as seed_data

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Optimization"])

Auth = Annotated[None, Depends(verify_api_key)]


def _default_request(strategy: OptimizationStrategy) -> OptimizationRequest:
    """Build a full OptimizationRequest using seed data as defaults."""
    return OptimizationRequest(
        strategy=strategy,
        suppliers=seed_data.SUPPLIERS,
        demands=seed_data.DEMANDS,
        pricing=seed_data.PRICING,
    )


# ── Optimize ──────────────────────────────────────────────────────────────────

@router.post("/api/optimize", response_model=OptimizationResponse)
async def run_optimization(
    payload: OptimizationRequest,
    _: Auth,
) -> OptimizationResponse:
    """
    Run the MILP solver with the supplied data and strategy.

    If you omit suppliers/demands/pricing, the endpoint falls back to
    seed data so you can test immediately without a full payload.
    """
    # Allow partial payloads — fall back to seed data for missing sections
    effective = OptimizationRequest(
        strategy=payload.strategy,
        suppliers=payload.suppliers or seed_data.SUPPLIERS,
        demands=payload.demands or seed_data.DEMANDS,
        pricing=payload.pricing or seed_data.PRICING,
        dual_source_min_fraction=payload.dual_source_min_fraction,
        max_single_supplier_fraction=payload.max_single_supplier_fraction,
    )

    try:
        result = optimizer.solve(effective)
    except Exception as exc:
        logger.exception("Optimizer error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Solver failed: {exc}",
        )

    return result


@router.get("/api/optimize/quick", response_model=OptimizationResponse)
async def quick_optimize(
    strategy: OptimizationStrategy = OptimizationStrategy.cost_minimization,
    _: Auth = None,  # type: ignore[assignment]
) -> OptimizationResponse:
    """
    Quick GET endpoint — runs optimization on seed data with the chosen strategy.
    Useful for the frontend's 'Run optimization' button without needing a payload.
    """
    try:
        result = optimizer.solve(_default_request(strategy))
    except Exception as exc:
        logger.exception("Quick optimizer error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Solver failed: {exc}",
        )
    return result


# ── Scenario simulation ───────────────────────────────────────────────────────

@router.post("/api/scenarios/simulate", response_model=ScenarioResponse)
async def simulate_scenario(
    payload: ScenarioRequest,
    _: Auth,
) -> ScenarioResponse:
    """
    Run a what-if scenario simulation.

    - supplier_disruption: one or more suppliers go offline
    - price_inflation: prices scaled by a multiplier
    - demand_surge: demand scaled by a multiplier

    Returns baseline + simulated results and delta metrics.
    """
    # Ensure base_request also falls back to seed data if omitted
    base = payload.base_request
    effective_base = OptimizationRequest(
        strategy=base.strategy,
        suppliers=base.suppliers or seed_data.SUPPLIERS,
        demands=base.demands or seed_data.DEMANDS,
        pricing=base.pricing or seed_data.PRICING,
        dual_source_min_fraction=base.dual_source_min_fraction,
        max_single_supplier_fraction=base.max_single_supplier_fraction,
    )
    effective_scenario = ScenarioRequest(
        base_request=effective_base,
        disruption_type=payload.disruption_type,
        disrupted_supplier_ids=payload.disrupted_supplier_ids,
        price_inflation_factor=payload.price_inflation_factor,
        demand_surge_factor=payload.demand_surge_factor,
        scenario_name=payload.scenario_name,
    )

    try:
        result = scenario.simulate(effective_scenario)
    except Exception as exc:
        logger.exception("Scenario simulation error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation failed: {exc}",
        )
    return result


# ── Strategy comparison ───────────────────────────────────────────────────────

@router.get("/api/optimize/compare", response_model=StrategyComparisonResponse)
async def compare_strategies(_: Auth) -> StrategyComparisonResponse:
    """
    Run all 4 strategies on seed data and return a side-by-side summary.
    Useful for the strategy comparison table in the frontend.
    """
    from app.models.optimization import StrategySummaryRow, StrategyComparisonResponse

    rows = []
    for strat in OptimizationStrategy:
        try:
            result = optimizer.solve(_default_request(strat))
            rows.append(StrategySummaryRow(
                strategy=strat,
                status=result.status,
                total_cost=result.summary.total_cost,
                demand_fulfillment_pct=result.summary.demand_fulfillment_pct,
                weighted_lead_time_days=result.summary.weighted_lead_time_days,
                supplier_count_used=result.summary.supplier_count_used,
                total_units_allocated=result.summary.total_units_allocated,
            ))
        except Exception as exc:
            logger.warning("Compare failed for %s: %s", strat, exc)

    if not rows:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="All strategies failed.")

    # Best values for each metric (for highlighting in UI)
    best_cost   = min(r.total_cost for r in rows)
    best_lt     = min(r.weighted_lead_time_days for r in rows)
    best_fill   = max(r.demand_fulfillment_pct for r in rows)

    return StrategyComparisonResponse(
        rows=rows,
        best_cost_strategy=next(r.strategy for r in rows if r.total_cost == best_cost),
        best_lead_time_strategy=next(r.strategy for r in rows if r.weighted_lead_time_days == best_lt),
        best_fulfillment_strategy=next(r.strategy for r in rows if r.demand_fulfillment_pct == best_fill),
    )
