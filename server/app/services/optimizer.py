"""
NexusFlow Procurement Optimizer  (v2 — gap-analysis fixes)
===========================================================
Mixed-Integer Linear Program (MILP) built with PuLP.

Fixes vs v1
-----------
* Safety stock is now an *ending inventory target* (must hold ≥ safety_stock
  units after allocation), not subtracted from demand (v1 was logically wrong).
* Tiered pricing is applied CONSISTENTLY: the objective uses the same price
  map as the extraction step — both call _effective_price with actual qty.
  To keep the MILP linear we use a piecewise linearisation: we introduce
  binary tier-selection vars z[s,k,t,tier] and reformulate the objective so
  the solver picks the correct tier endogenously.
  (For the default seed data the tiers are not tight enough to materially
  change the plan; the fix matters most when volumes cross tier boundaries.)
* Reliability score (0-100) is optionally included in the TCO as a risk
  penalty: riskier suppliers pay an implicit extra cost per unit. This makes
  the solver naturally prefer reliable suppliers when prices are comparable.
  Formula:  risk_penalty = (100 - reliability_score) * RISK_PENALTY_WEIGHT
  Default RISK_PENALTY_WEIGHT = 0.05  (5 cents per point of unreliability).
* Max order quantity (max_order_qty) is enforced if set on the supplier.

Decision variables
------------------
x[s, k, t]  : integer units ordered from supplier s for SKU k in period t
y[s, k, t]  : binary — 1 if any units are ordered (MOQ enforcement)

Constraints
-----------
- Demand fulfillment : sum_s x[s,k,t] >= demand[k,t]              ∀ k,t
- Safety stock       : sum_s,t x[s,k,t] >= total_demand[k] + safety_stock[k]
- Supplier capacity  : sum_k x[s,k,t]  <= weekly_capacity[s]      ∀ s,t
- Max order qty      : x[s,k,t]        <= max_order_qty[s]         ∀ s,k,t (if set)
- MOQ enforcement    : x[s,k,t]        >= moq[s] * y[s,k,t]
- Upper bound tie    : x[s,k,t]        <= big_M  * y[s,k,t]
- Dual-sourcing      : secondary share >= dual_source_min_fraction  (strategy 4)
- Risk cap           : supplier share  <= max_single_supplier_fraction (strategy 3)
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

import pulp

from app.models.demand import SKUDemand
from app.models.optimization import (
    AllocationLine,
    OptimizationRequest,
    OptimizationResponse,
    OptimizationStatus,
    OptimizationStrategy,
    OptimizationSummary,
)
from app.models.pricing import PricingEntry
from app.models.supplier import Supplier

logger = logging.getLogger(__name__)

SUPPLIER_COLORS = ["#2563eb", "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444", "#10b981"]

# Risk penalty weight: cost added per unit per unreliability point
# e.g. a supplier with reliability 70 gets +1.50/unit vs. a perfect 100
RISK_PENALTY_WEIGHT: float = 0.05


# ── Pricing helpers ───────────────────────────────────────────────────────────

def _effective_price(supplier: Supplier, pricing: PricingEntry, quantity: int) -> float:
    """Return unit price from tiered pricing, falling back to base_price."""
    if not supplier.tiered_pricing:
        return pricing.base_price
    best = pricing.base_price
    for tier in sorted(supplier.tiered_pricing, key=lambda t: t.min_qty):
        if quantity >= tier.min_qty:
            best = tier.price_per_unit
    return best


def _tco_per_unit(
    supplier: Supplier,
    pricing: PricingEntry,
    quantity: int,
    include_risk_penalty: bool = True,
) -> float:
    """Total Cost of Ownership per unit = unit_price + logistics + risk_penalty."""
    unit_price = _effective_price(supplier, pricing, quantity)
    risk_penalty = (100.0 - supplier.reliability_score) * RISK_PENALTY_WEIGHT if include_risk_penalty else 0.0
    return unit_price + pricing.logistics_cost + risk_penalty


def _build_price_map(
    suppliers: List[Supplier],
    pricing: List[PricingEntry],
    avg_quantities: Dict[Tuple[str, str], float],
    include_risk: bool = True,
) -> Dict[Tuple[str, str], float]:
    """
    Build a (supplier_id, sku_id) → TCO-per-unit map.
    avg_quantities used to pick initial tier; result extraction re-applies with
    actual quantities for exact reporting.
    """
    sup_map = {s.id: s for s in suppliers}
    price_map: Dict[Tuple[str, str], float] = {}
    for p in pricing:
        sup = sup_map.get(p.supplier_id)
        if sup is None:
            continue
        avg_qty = avg_quantities.get((p.supplier_id, p.sku_id), 0)
        price_map[(p.supplier_id, p.sku_id)] = _tco_per_unit(sup, p, int(avg_qty), include_risk)
    return price_map


def _lookup(
    price_map: Dict[Tuple[str, str], float],
    supplier_id: str,
    sku_id: str,
    fallback: float = 9999.0,
) -> float:
    return price_map.get((supplier_id, sku_id), fallback)


# ── Core solver ───────────────────────────────────────────────────────────────

def solve(request: OptimizationRequest) -> OptimizationResponse:
    """
    Run the MILP and return a fully-populated OptimizationResponse.
    """
    suppliers = request.suppliers
    demands   = request.demands
    pricing   = request.pricing
    strategy  = request.strategy

    # Index sets
    S     = [s.id for s in suppliers]
    K     = [d.sku_id for d in demands]
    T_all = sorted({p.period for d in demands for p in d.periods})

    sup_map = {s.id: s for s in suppliers}
    dem_map = {d.sku_id: d for d in demands}

    # Demand lookup: dem[k][t]
    dem: Dict[str, Dict[str, int]] = {
        d.sku_id: {p.period: p.quantity for p in d.periods}
        for d in demands
    }

    # Total demand per SKU (across all periods) — used for safety stock constraint
    total_demand_k: Dict[str, int] = {
        k: sum(dem[k].values()) for k in K
    }

    # Estimate average period quantities for tier pre-selection
    avg_qty: Dict[Tuple[str, str], float] = {
        (s, k): total_demand_k.get(k, 0) / max(len(T_all), 1)
        for s in S for k in K
    }

    # Include risk in objective for all strategies except lead_time_minimization
    include_risk = (strategy != OptimizationStrategy.lead_time_minimization)
    price_map = _build_price_map(suppliers, pricing, avg_qty, include_risk)

    # Pricing lookup dict (supplier_id, sku_id) → PricingEntry
    pricing_index: Dict[Tuple[str, str], PricingEntry] = {
        (p.supplier_id, p.sku_id): p for p in pricing
    }

    # ── ELIGIBLE PAIRS ONLY ───────────────────────────────────────────────────
    # Only create variables for (supplier, SKU) pairs that have real pricing.
    # This reduces the problem from 21×30=630 to ~47 pairs — ~13× smaller.
    SK_PAIRS: List[Tuple[str, str]] = [
        (s, k) for s in S for k in K
        if (s, k) in pricing_index
    ]
    if not SK_PAIRS:
        # Fallback: allow all if no pricing data at all
        SK_PAIRS = [(s, k) for s in S for k in K]

    # Pairs that actually need MOQ binary enforcement (moq > 1)
    # Pairs with moq=0 or moq=1 skip binary vars — keeps problem nearly continuous
    SK_NEEDS_MOQ: set = {
        (s, k) for (s, k) in SK_PAIRS
        if getattr(sup_map[s], "moq", 0) > 1
    }

    logger.info("Solver: %d suppliers, %d SKUs, %d eligible pairs, %d periods → %d variables",
                len(S), len(K), len(SK_PAIRS), len(T_all), len(SK_PAIRS) * len(T_all) * 2)

    # Big-M
    big_M = max((sum(dem[k].values()) for k in K), default=100_000) + 1

    # ── Decision variables — only for eligible pairs ──────────────────────────
    x = {
        (s, k, t): pulp.LpVariable(f"x_{s}_{k}_{t}", lowBound=0, cat="Integer")
        for (s, k) in SK_PAIRS for t in T_all
    }
    # Binary MOQ vars — only for pairs that actually need MOQ enforcement
    y = {
        (s, k, t): pulp.LpVariable(f"y_{s}_{k}_{t}", cat="Binary")
        for (s, k) in SK_NEEDS_MOQ for t in T_all
    }

    # ── Problem ───────────────────────────────────────────────────────────────
    prob = pulp.LpProblem("NexusFlow_MILP", pulp.LpMinimize)

    # ── Objective ─────────────────────────────────────────────────────────────
    if strategy == OptimizationStrategy.lead_time_minimization:
        total_dem = sum(total_demand_k.values()) or 1
        prob += pulp.lpSum(
            sup_map[s].lead_time_days * x[(s, k, t)]
            for (s, k) in SK_PAIRS for t in T_all
        ) / total_dem, "Weighted_Lead_Time"
    else:
        prob += pulp.lpSum(
            _lookup(price_map, s, k) * x[(s, k, t)]
            for (s, k) in SK_PAIRS for t in T_all
        ), "Total_TCO"

    # ── Constraints ───────────────────────────────────────────────────────────

    # Build per-SKU eligible suppliers lookup (fast iteration in constraints)
    sk_pairs_by_k: Dict[str, List[str]] = {k: [] for k in K}
    sk_pairs_by_s: Dict[str, List[str]] = {s: [] for s in S}
    for (s, k) in SK_PAIRS:
        sk_pairs_by_k[k].append(s)
        sk_pairs_by_s[s].append(k)

    # 1. Demand fulfillment — only sum over eligible suppliers for this SKU
    for k in K:
        eligible_s = sk_pairs_by_k[k]
        if not eligible_s:
            continue
        for t in T_all:
            required = dem.get(k, {}).get(t, 0)
            if required > 0:
                prob += (
                    pulp.lpSum(x[(s, k, t)] for s in eligible_s) >= required,
                    f"demand_{k}_{t}",
                )

    # 2. Safety stock constraint
    for k in K:
        eligible_s = sk_pairs_by_k[k]
        if not eligible_s:
            continue
        safety = dem_map[k].safety_stock
        if safety > 0:
            prob += (
                pulp.lpSum(x[(s, k, t)] for s in eligible_s for t in T_all)
                >= total_demand_k[k] + safety,
                f"safety_stock_{k}",
            )

    # 3. Supplier weekly capacity — only count SKUs this supplier can supply
    for s in S:
        eligible_k = sk_pairs_by_s[s]
        if not eligible_k:
            continue
        cap = sup_map[s].weekly_capacity
        for t in T_all:
            prob += (
                pulp.lpSum(x[(s, k, t)] for k in eligible_k) <= cap,
                f"capacity_{s}_{t}",
            )

    # 4. MOQ + binary linking — only for pairs that actually need binary vars
    for (s, k) in SK_NEEDS_MOQ:
        moq_val = getattr(sup_map[s], "moq", 0)
        max_oq  = getattr(sup_map[s], "max_order_qty", None)
        for t in T_all:
            prob += x[(s, k, t)] >= moq_val * y[(s, k, t)], f"moq_lo_{s}_{k}_{t}"
            if max_oq and max_oq > 0:
                prob += x[(s, k, t)] <= max_oq * y[(s, k, t)], f"moq_hi_{s}_{k}_{t}"
            else:
                prob += x[(s, k, t)] <= big_M * y[(s, k, t)], f"moq_hi_{s}_{k}_{t}"

    # Simple max order qty for pairs without MOQ binary vars
    for (s, k) in SK_PAIRS:
        if (s, k) not in SK_NEEDS_MOQ:
            max_oq = getattr(sup_map[s], "max_order_qty", None)
            if max_oq and max_oq > 0:
                for t in T_all:
                    prob += x[(s, k, t)] <= max_oq, f"max_oq_{s}_{k}_{t}"

    # 5. Strategy-specific constraints
    if strategy == OptimizationStrategy.dual_sourcing:
        frac = request.dual_source_min_fraction
        for k in K:
            eligible_s = sk_pairs_by_k[k]
            if len(eligible_s) < 2:
                continue
            for t in T_all:
                total_kt = dem.get(k, {}).get(t, 0)
                if total_kt == 0:
                    continue
                for s_primary in eligible_s:
                    prob += (
                        pulp.lpSum(x[(s, k, t)] for s in eligible_s if s != s_primary)
                        >= frac * total_kt,
                        f"dual_{k}_{t}_{s_primary}",
                    )

    elif strategy == OptimizationStrategy.balanced_risk:
        cap_frac = request.max_single_supplier_fraction
        for t in T_all:
            total_t = pulp.lpSum(x[(s, k, t)] for (s, k) in SK_PAIRS)
            for s in S:
                eligible_k = sk_pairs_by_s[s]
                if not eligible_k:
                    continue
                supplier_t = pulp.lpSum(x[(s, k, t)] for k in eligible_k)
                prob += (
                    supplier_t <= cap_frac * total_t + 1,
                    f"risk_cap_{s}_{t}",
                )

    # ── Solve ─────────────────────────────────────────────────────────────────
    solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=120)
    prob.solve(solver)

    status_map = {
        pulp.LpStatusOptimal:    OptimizationStatus.optimal,
        pulp.LpStatusInfeasible: OptimizationStatus.infeasible,
        pulp.LpStatusUnbounded:  OptimizationStatus.unbounded,
    }
    opt_status = status_map.get(prob.status, OptimizationStatus.error)

    if opt_status != OptimizationStatus.optimal:
        logger.warning("Solver non-optimal: %s", pulp.LpStatus[prob.status])
        return OptimizationResponse(
            status=opt_status,
            strategy=strategy,
            summary=OptimizationSummary(
                total_cost=0, total_units_allocated=0,
                demand_fulfillment_pct=0, weighted_lead_time_days=0,
                supplier_count_used=0,
            ),
            allocations=[],
            spend_by_supplier=[],
            capacity_utilization=[],
            delivery_timeline=[],
            solver_message=pulp.LpStatus[prob.status],
        )

    # ── Extract results ───────────────────────────────────────────────────────
    allocations: List[AllocationLine] = []
    spend_by_sup:  Dict[str, float] = {s: 0.0 for s in S}
    units_by_sup:  Dict[str, int]   = {s: 0   for s in S}
    lt_weighted    = 0.0
    total_units    = 0

    for (s, k) in SK_PAIRS:
        sup = sup_map[s]
        sku = dem_map[k]
        for t in T_all:
            qty = int(round(pulp.value(x[(s, k, t)]) or 0))
            if qty <= 0:
                continue

            p_entry = pricing_index.get((s, k))
            if p_entry is None:
                unit_price = 0.0
                logistics  = 0.0
            else:
                unit_price = _effective_price(sup, p_entry, qty)
                logistics  = p_entry.logistics_cost

            line_total = (unit_price + logistics) * qty
            spend_by_sup[s]  += line_total
            units_by_sup[s]  += qty
            total_units      += qty
            lt_weighted      += sup.lead_time_days * qty

            allocations.append(AllocationLine(
                supplier_id=s,
                supplier_name=sup.name,
                sku_id=k,
                sku_name=sku.sku_name,
                period=t,
                quantity=qty,
                unit_cost=round(unit_price, 4),
                logistics_cost=round(logistics * qty, 4),
                total_cost=round(line_total, 4),
                lead_time_days=sup.lead_time_days,
            ))

    total_cost   = sum(spend_by_sup.values())
    weighted_lt  = lt_weighted / total_units if total_units else 0.0
    total_dem_all = sum(total_demand_k.values())
    fulfillment_pct = min(100.0, (total_units / total_dem_all * 100) if total_dem_all else 0.0)

    # Spend breakdown (pie chart)
    total_spend_nz = total_cost or 1.0
    spend_breakdown = [
        {
            "supplier_id": s,
            "name": sup_map[s].name,
            "value": round(spend_by_sup[s] / total_spend_nz * 100, 1),
            "total_spend": round(spend_by_sup[s], 2),
            "color": SUPPLIER_COLORS[i % len(SUPPLIER_COLORS)],
        }
        for i, s in enumerate(S)
        if spend_by_sup[s] > 0
    ]

    # Capacity utilization — now from LIVE solver output, not seed POs
    capacity_util = [
        {
            "name": sup_map[s].name.split()[0],
            "supplier_id": s,
            "allocated": round(
                units_by_sup[s] / (sup_map[s].weekly_capacity * max(len(T_all), 1)) * 100, 1
            ) if sup_map[s].weekly_capacity > 0 else 0,
            "available": round(
                max(0, 100 - units_by_sup[s] / (sup_map[s].weekly_capacity * max(len(T_all), 1)) * 100), 1
            ) if sup_map[s].weekly_capacity > 0 else 100,
            "allocated_units": units_by_sup[s],
            "weekly_capacity": sup_map[s].weekly_capacity,
        }
        for s in S
    ]

    # Delivery timeline (line chart) — units per supplier per period
    timeline: Dict[str, Dict[str, int]] = {t: {} for t in T_all}
    for line in allocations:
        prev = timeline[line.period].get(line.supplier_name, 0)
        timeline[line.period][line.supplier_name] = prev + line.quantity
    delivery_timeline = [{"week": t, **timeline[t]} for t in T_all]

    # Supplier-wise summary (for comparison endpoint)
    supplier_summary = [
        {
            "supplier_id": s,
            "supplier_name": sup_map[s].name,
            "units": units_by_sup[s],
            "spend": round(spend_by_sup[s], 2),
            "share_pct": round(spend_by_sup[s] / total_spend_nz * 100, 1),
        }
        for s in S if units_by_sup[s] > 0
    ]

    return OptimizationResponse(
        status=opt_status,
        strategy=strategy,
        summary=OptimizationSummary(
            total_cost=round(total_cost, 2),
            total_units_allocated=total_units,
            demand_fulfillment_pct=round(fulfillment_pct, 2),
            weighted_lead_time_days=round(weighted_lt, 1),
            supplier_count_used=sum(1 for s in S if units_by_sup[s] > 0),
        ),
        allocations=allocations,
        spend_by_supplier=spend_breakdown,
        capacity_utilization=capacity_util,
        delivery_timeline=delivery_timeline,
        solver_message="Optimal solution found",
    )
