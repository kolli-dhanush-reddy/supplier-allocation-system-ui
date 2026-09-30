/**
 * NexusFlow Procurement Intelligence — shared TypeScript types.
 * These mirror the Pydantic models in server/app/models/*.py exactly.
 * Any change to the Python models should be reflected here.
 */

// ─────────────────────────────────────────────────────────────
// Suppliers
// ─────────────────────────────────────────────────────────────

export type SupplierStatus = 'active' | 'at_risk' | 'inactive'
export type PaymentTerms = 'net_30' | 'net_60' | 'net_90' | 'prepaid' | 'cod'

export interface TieredPrice {
  min_qty: number
  price_per_unit: number
}

export interface Supplier {
  id: string
  name: string
  status: SupplierStatus
  reliability_score: number   // 0–100
  lead_time_days: number
  weekly_capacity: number
  moq: number
  max_order_qty: number       // 0 = unlimited
  location?: string
  logistics_cost_per_unit: number
  payment_terms: PaymentTerms
  tiered_pricing: TieredPrice[]
  contact_email?: string
  notes?: string
}

export interface SupplierUpsert {
  id?: string
  name: string
  status?: SupplierStatus
  reliability_score?: number
  lead_time_days?: number
  weekly_capacity?: number
  moq?: number
  max_order_qty?: number
  location?: string
  logistics_cost_per_unit?: number
  payment_terms?: PaymentTerms
  tiered_pricing?: TieredPrice[]
  contact_email?: string
  notes?: string
}

export interface SupplierCapacity {
  supplier_id: string
  supplier_name: string
  allocated_pct: number       // 0–100
  available_pct: number       // 0–100
  weekly_capacity: number
  allocated_units: number
}

export interface SupplierListResponse {
  suppliers: Supplier[]
  total: number
}

export interface CapacityListResponse {
  capacities: SupplierCapacity[]
}

// ─────────────────────────────────────────────────────────────
// Demand
// ─────────────────────────────────────────────────────────────

export interface DemandPeriod {
  period: string              // e.g. "W1", "W2"
  quantity: number
}

export interface SKUDemand {
  sku_id: string
  sku_name: string
  category?: string
  unit_of_measure?: string
  periods: DemandPeriod[]
  total_demand?: number
  safety_stock: number
}

export interface DemandRequest {
  demands: SKUDemand[]
  planning_horizon_weeks: number
}

export interface DemandResponse {
  demands: SKUDemand[]
  planning_horizon_weeks: number
  total_skus: number
  total_units: number
}

// ─────────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────────

export interface PricingEntry {
  supplier_id: string
  sku_id: string
  base_price: number
  logistics_cost: number
  effective_price?: number
}

export interface PricingResponse {
  entries: PricingEntry[]
  total_entries: number
}

export interface SpendBreakdown {
  supplier_id: string
  supplier_name: string       // mapped to "name" for Recharts
  name: string
  total_spend: number
  spend_pct: number
  value: number               // alias of spend_pct for Recharts PieChart
  color: string
}

// ─────────────────────────────────────────────────────────────
// Optimization
// ─────────────────────────────────────────────────────────────

export type OptimizationStrategy =
  | 'cost_minimization'
  | 'lead_time_minimization'
  | 'balanced_risk'
  | 'dual_sourcing'

export type OptimizationStatus = 'optimal' | 'infeasible' | 'unbounded' | 'error'

export interface OptimizationRequest {
  strategy: OptimizationStrategy
  suppliers?: Supplier[]
  demands?: SKUDemand[]
  pricing?: PricingEntry[]
  dual_source_min_fraction?: number   // default 0.2
  max_single_supplier_fraction?: number // default 0.7
}

export interface AllocationLine {
  supplier_id: string
  supplier_name: string
  sku_id: string
  sku_name: string
  period: string
  quantity: number
  unit_cost: number
  logistics_cost: number
  total_cost: number
  lead_time_days: number
}

export interface OptimizationSummary {
  total_cost: number
  total_units_allocated: number
  demand_fulfillment_pct: number
  weighted_lead_time_days: number
  supplier_count_used: number
  cost_savings_vs_baseline?: number
}

export interface OptimizationResponse {
  status: OptimizationStatus
  strategy: OptimizationStrategy
  summary: OptimizationSummary
  allocations: AllocationLine[]
  spend_by_supplier: SpendBreakdown[]
  capacity_utilization: CapacityChartEntry[]
  delivery_timeline: DeliveryTimelineEntry[]
  solver_message?: string
}

// Chart-friendly shapes
export interface CapacityChartEntry {
  name: string
  supplier_id: string
  allocated: number
  available: number
}

export interface DeliveryTimelineEntry {
  week: string
  [supplierName: string]: string | number
}

// ─────────────────────────────────────────────────────────────
// Scenario simulation
// ─────────────────────────────────────────────────────────────

export type DisruptionType =
  | 'supplier_disruption'
  | 'price_inflation'
  | 'demand_surge'

export interface ScenarioRequest {
  base_request: OptimizationRequest
  disruption_type: DisruptionType
  disrupted_supplier_ids?: string[]
  price_inflation_factor?: number     // e.g. 1.15 = +15%
  demand_surge_factor?: number        // e.g. 1.3  = +30%
  scenario_name?: string
}

export interface ScenarioResponse {
  scenario_name: string
  disruption_type: DisruptionType
  baseline: OptimizationResponse
  simulated: OptimizationResponse
  cost_delta: number
  cost_delta_pct: number
  fulfillment_delta_pct: number
  lead_time_delta_days: number
  risk_assessment: string
}

// ─────────────────────────────────────────────────────────────
// Purchase Orders
// ─────────────────────────────────────────────────────────────

export type POStatus = 'Draft' | 'Confirmed' | 'In transit' | 'At risk' | 'Delivered' | 'Cancelled'

export interface POLineItem {
  sku_id: string
  sku_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface PurchaseOrder {
  po_number: string
  supplier_id: string
  supplier_name: string
  line_items: POLineItem[]
  order_value: number
  expected_delivery: string   // ISO date string "YYYY-MM-DD"
  status: POStatus
  created_at?: string
  notes?: string
}

export interface PurchaseOrderListResponse {
  orders: PurchaseOrder[]
  total: number
  total_value: number
}

// ─────────────────────────────────────────────────────────────
// API client helpers
// ─────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string
  status: number
}

// ─────────────────────────────────────────────────────────────
// Strategy comparison
// ─────────────────────────────────────────────────────────────

export interface StrategySummaryRow {
  strategy: OptimizationStrategy
  status: OptimizationStatus
  total_cost: number
  demand_fulfillment_pct: number
  weighted_lead_time_days: number
  supplier_count_used: number
  total_units_allocated: number
}

export interface StrategyComparisonResponse {
  rows: StrategySummaryRow[]
  best_cost_strategy: OptimizationStrategy
  best_lead_time_strategy: OptimizationStrategy
  best_fulfillment_strategy: OptimizationStrategy
}
