"""
Scenario Simulation Service
============================
Applies a disruption to the base OptimizationRequest, re-runs the solver,
and returns a side-by-side comparison of baseline vs. simulated results.

Supported disruption types
--------------------------
supplier_disruption  — zero out the disrupted suppliers' capacity
price_inflation      — multiply all pricing entries by a factor
demand_surge         — multiply all demand quantities by a factor
"""

from __future__ import annotations

import copy
import logging

from app.models.optimization import (
    DisruptionType,
    OptimizationRequest,
    ScenarioRequest,
    ScenarioResponse,
)
from app.services.optimizer import solve

logger = logging.getLogger(__name__)


def _apply_disruption(req: OptimizationRequest, scenario: ScenarioRequest) -> OptimizationRequest:
    """Return a deep-copied request with the disruption applied."""
    modified = copy.deepcopy(req)

    if scenario.disruption_type == DisruptionType.supplier_disruption:
        # Set disrupted suppliers' weekly capacity to 0 so the MILP ignores them
        disrupted = set(scenario.disrupted_supplier_ids)
        for sup in modified.suppliers:
            if sup.id in disrupted:
                sup.weekly_capacity = 0
                logger.info("Disruption: zeroed capacity for supplier %s", sup.id)

    elif scenario.disruption_type == DisruptionType.price_inflation:
        factor = scenario.price_inflation_factor
        for entry in modified.pricing:
            entry.base_price = round(entry.base_price * factor, 4)
            if entry.effective_price is not None:
                entry.effective_price = round(entry.effective_price * factor, 4)
        # Also scale tiered pricing
        for sup in modified.suppliers:
            for tier in sup.tiered_pricing:
                tier.price_per_unit = round(tier.price_per_unit * factor, 4)
        logger.info("Disruption: applied price inflation factor %.2f", factor)

    elif scenario.disruption_type == DisruptionType.demand_surge:
        factor = scenario.demand_surge_factor
        for demand in modified.demands:
            for period in demand.periods:
                period.quantity = int(period.quantity * factor)
        logger.info("Disruption: applied demand surge factor %.2f", factor)

    return modified


def simulate(scenario: ScenarioRequest) -> ScenarioResponse:
    """Run baseline and disrupted optimization, then compute deltas."""

    # ── Baseline run ──────────────────────────────────────────────────────────
    baseline_result = solve(scenario.base_request)

    # ── Disrupted run ─────────────────────────────────────────────────────────
    disrupted_request = _apply_disruption(scenario.base_request, scenario)
    simulated_result = solve(disrupted_request)

    # ── Delta calculations ────────────────────────────────────────────────────
    baseline_cost = baseline_result.summary.total_cost or 0.0
    simulated_cost = simulated_result.summary.total_cost or 0.0
    cost_delta = round(simulated_cost - baseline_cost, 2)
    cost_delta_pct = round(
        (cost_delta / baseline_cost * 100) if baseline_cost else 0.0, 2
    )

    baseline_fulfillment = baseline_result.summary.demand_fulfillment_pct
    simulated_fulfillment = simulated_result.summary.demand_fulfillment_pct
    fulfillment_delta_pct = round(simulated_fulfillment - baseline_fulfillment, 2)

    baseline_lt = baseline_result.summary.weighted_lead_time_days
    simulated_lt = simulated_result.summary.weighted_lead_time_days
    lead_time_delta = round(simulated_lt - baseline_lt, 1)

    # ── Risk assessment ───────────────────────────────────────────────────────
    risk_parts: list[str] = []

    if cost_delta_pct > 20:
        risk_parts.append(f"Critical cost increase of {cost_delta_pct:.1f}%.")
    elif cost_delta_pct > 5:
        risk_parts.append(f"Moderate cost increase of {cost_delta_pct:.1f}%.")
    elif cost_delta_pct < 0:
        risk_parts.append(f"Cost decreased by {abs(cost_delta_pct):.1f}%.")
    else:
        risk_parts.append("Cost impact is minimal.")

    if fulfillment_delta_pct < -10:
        risk_parts.append(
            f"Significant fulfillment drop of {abs(fulfillment_delta_pct):.1f}% — "
            "consider activating alternate suppliers."
        )
    elif fulfillment_delta_pct < -2:
        risk_parts.append(f"Minor fulfillment drop of {abs(fulfillment_delta_pct):.1f}%.")
    else:
        risk_parts.append("Demand fulfillment remains stable.")

    if lead_time_delta > 5:
        risk_parts.append(f"Lead time increases by {lead_time_delta:.1f} days — expediting may be needed.")
    elif lead_time_delta > 0:
        risk_parts.append(f"Lead time increases slightly by {lead_time_delta:.1f} days.")
    else:
        risk_parts.append("Lead time is unaffected.")

    if simulated_result.summary.supplier_count_used < baseline_result.summary.supplier_count_used:
        risk_parts.append("Fewer suppliers available — concentration risk increased.")

    risk_assessment = " ".join(risk_parts)

    return ScenarioResponse(
        scenario_name=scenario.scenario_name or "Unnamed scenario",
        disruption_type=scenario.disruption_type,
        baseline=baseline_result,
        simulated=simulated_result,
        cost_delta=cost_delta,
        cost_delta_pct=cost_delta_pct,
        fulfillment_delta_pct=fulfillment_delta_pct,
        lead_time_delta_days=lead_time_delta,
        risk_assessment=risk_assessment,
    )
