/**
 * NexusFlow API Client
 * =====================
 * Typed axios client for all FastAPI backend endpoints.
 *
 * The API key is read from NEXT_PUBLIC_NOVA_API_KEY and sent
 * automatically on every request via the X-API-Key header.
 *
 * Usage:
 *   import { api } from '@/src/lib/api'
 *   const suppliers = await api.suppliers.list()
 */

import axios, { AxiosError, AxiosInstance } from 'axios'
import type {
  CapacityListResponse,
  DemandRequest,
  DemandResponse,
  OptimizationRequest,
  OptimizationResponse,
  OptimizationStrategy,
  PricingResponse,
  PurchaseOrder,
  PurchaseOrderListResponse,
  ScenarioRequest,
  ScenarioResponse,
  SpendBreakdown,
  StrategyComparisonResponse,
  Supplier,
  SupplierListResponse,
  SupplierUpsert,
  ApiError,
} from '@/src/types/procurement'

// ─────────────────────────────────────────────────────────────
// Axios instance
// ─────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const API_KEY  = process.env.NEXT_PUBLIC_NOVA_API_KEY ?? ''

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 300_000,           // 5 min — MILP solver can take time on large datasets
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
})

// ── Response interceptor: normalise errors ────────────────────
client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail: string }>) => {
    const apiError: ApiError = {
      detail: error.response?.data?.detail ?? error.message ?? 'Unknown error',
      status: error.response?.status ?? 0,
    }
    return Promise.reject(apiError)
  },
)

// ─────────────────────────────────────────────────────────────
// Suppliers
// ─────────────────────────────────────────────────────────────

const suppliers = {
  /** List all suppliers */
  list: async (): Promise<SupplierListResponse> => {
    const { data } = await client.get<SupplierListResponse>('/api/suppliers')
    return data
  },

  /** Get a single supplier by ID */
  get: async (supplierId: string): Promise<Supplier> => {
    const { data } = await client.get<Supplier>(`/api/suppliers/${supplierId}`)
    return data
  },

  /** Create a new supplier */
  create: async (payload: SupplierUpsert): Promise<Supplier> => {
    const { data } = await client.post<Supplier>('/api/suppliers', payload)
    return data
  },

  /** Full update of a supplier */
  update: async (supplierId: string, payload: SupplierUpsert): Promise<Supplier> => {
    const { data } = await client.put<Supplier>(`/api/suppliers/${supplierId}`, payload)
    return data
  },

  /** Update supplier status only */
  updateStatus: async (supplierId: string, newStatus: string): Promise<Supplier> => {
    const { data } = await client.patch<Supplier>(
      `/api/suppliers/${supplierId}/status`,
      null,
      { params: { new_status: newStatus } },
    )
    return data
  },

  /** Delete a supplier */
  delete: async (supplierId: string): Promise<void> => {
    await client.delete(`/api/suppliers/${supplierId}`)
  },

  /** Get capacity utilization for all suppliers */
  capacities: async (): Promise<CapacityListResponse> => {
    const { data } = await client.get<CapacityListResponse>('/api/suppliers/capacity/all')
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Demand
// ─────────────────────────────────────────────────────────────

const demand = {
  /** Get current demand plan */
  get: async (): Promise<DemandResponse> => {
    const { data } = await client.get<DemandResponse>('/api/demand')
    return data
  },

  /** Upsert demand plan */
  upsert: async (payload: DemandRequest): Promise<DemandResponse> => {
    const { data } = await client.post<DemandResponse>('/api/demand', payload)
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Pricing
// ─────────────────────────────────────────────────────────────

const pricing = {
  /** Get full pricing matrix */
  get: async (): Promise<PricingResponse> => {
    const { data } = await client.get<PricingResponse>('/api/pricing')
    return data
  },

  /** Get spend breakdown per supplier (for pie chart) */
  spendBreakdown: async (): Promise<SpendBreakdown[]> => {
    const { data } = await client.get<SpendBreakdown[]>('/api/pricing/spend-breakdown')
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Optimization
// ─────────────────────────────────────────────────────────────

const optimization = {
  /**
   * Run full MILP optimization with a custom payload.
   * All fields are optional — omit suppliers/demands/pricing to use seed data.
   */
  run: async (payload: OptimizationRequest): Promise<OptimizationResponse> => {
    const { data } = await client.post<OptimizationResponse>('/api/optimize', payload)
    return data
  },

  /**
   * Quick GET — run optimization on seed data with a chosen strategy.
   * Perfect for the dashboard "Run optimization" button.
   */
  quick: async (strategy: OptimizationStrategy = 'cost_minimization'): Promise<OptimizationResponse> => {
    const { data } = await client.get<OptimizationResponse>('/api/optimize/quick', {
      params: { strategy },
    })
    return data
  },

  /** Run all 4 strategies and return side-by-side comparison. */
  compare: async (): Promise<StrategyComparisonResponse> => {
    const { data } = await client.get<StrategyComparisonResponse>('/api/optimize/compare')
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────

const scenarios = {
  /**
   * Run a what-if scenario simulation.
   * Returns baseline + disrupted results and delta metrics.
   */
  simulate: async (payload: ScenarioRequest): Promise<ScenarioResponse> => {
    const { data } = await client.post<ScenarioResponse>('/api/scenarios/simulate', payload)
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Purchase Orders
// ─────────────────────────────────────────────────────────────

const purchaseOrders = {
  /** List all purchase orders */
  list: async (): Promise<PurchaseOrderListResponse> => {
    const { data } = await client.get<PurchaseOrderListResponse>('/api/purchase-orders')
    return data
  },

  /** Get a single PO by number */
  get: async (poNumber: string): Promise<PurchaseOrder> => {
    const { data } = await client.get<PurchaseOrder>(`/api/purchase-orders/${poNumber}`)
    return data
  },

  /** Generate draft POs from optimization allocation lines */
  generate: async (allocations: object[], supplierIds?: string[]): Promise<PurchaseOrderListResponse> => {
    const { data } = await client.post<PurchaseOrderListResponse>(
      '/api/purchase-orders/generate',
      { allocations, supplier_ids: supplierIds ?? null },
    )
    return data
  },

  /** Update PO status */
  updateStatus: async (poNumber: string, newStatus: string): Promise<PurchaseOrder> => {
    const { data } = await client.patch<PurchaseOrder>(
      `/api/purchase-orders/${poNumber}/status`,
      null,
      { params: { new_status: newStatus } },
    )
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────

const health = {
  check: async (): Promise<{
    status: string
    app: string
    version: string
    data_source?: string
    last_synced_at?: string
    dataset?: { suppliers: number; skus: number; pricing_pairs: number; purchase_orders: number }
  }> => {
    const { data } = await client.get('/health')
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Nova API management
// ─────────────────────────────────────────────────────────────

export interface NovaStatus {
  data_source: string       // "nova" | "fallback" | "unloaded"
  last_synced_at: string | null
  suppliers: number
  skus: number
  pricing_pairs: number
  purchase_orders: number
}

export interface NovaSyncResult extends NovaStatus {
  success: boolean
  message: string
}

const nova = {
  /** Current data store metadata — source, last sync time, record counts */
  status: async (): Promise<NovaStatus> => {
    const { data } = await client.get<NovaStatus>('/api/nova/status')
    return data
  },

  /** Force a fresh pull from the Nova API */
  sync: async (): Promise<NovaSyncResult> => {
    const { data } = await client.post<NovaSyncResult>('/api/nova/sync')
    return data
  },

  /** Check if the Nova API is reachable right now */
  healthCheck: async (): Promise<{ nova_api_reachable: boolean; base_url: string }> => {
    const { data } = await client.get('/api/nova/health')
    return data
  },

  /** Get Nova API key metadata (team name, slot, rate limits) */
  me: async (): Promise<{ name: string; email: string; team_slot: number; dataset_slice: number; rate_limit_per_min: number }> => {
    const { data } = await client.get('/api/nova/me')
    return data
  },
}

// ─────────────────────────────────────────────────────────────
// Named export
// ─────────────────────────────────────────────────────────────

export const api = {
  suppliers,
  demand,
  pricing,
  optimization,
  scenarios,
  purchaseOrders,
  health,
  nova,
}

export default api
