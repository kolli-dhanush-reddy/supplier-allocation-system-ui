/**
 * Reusable data-fetching hooks for the NexusFlow frontend.
 * Each hook returns { data, loading, error, refetch }.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type {
  ApiError,
  CapacityListResponse,
  DemandResponse,
  OptimizationResponse,
  OptimizationStrategy,
  PricingResponse,
  PurchaseOrderListResponse,
  ScenarioRequest,
  ScenarioResponse,
  SpendBreakdown,
  StrategyComparisonResponse,
  Supplier,
  SupplierListResponse,
  SupplierUpsert,
} from '@/src/types/procurement'

// ─────────────────────────────────────────────────────────────
// Generic async hook factory
// ─────────────────────────────────────────────────────────────

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: ApiError | null
  refetch: () => void
}

function useAsync<T>(fetcher: () => Promise<T>, runOnMount = true): AsyncState<T> {
  const [data, setData]       = useState<T | null>(null)
  const [loading, setLoading] = useState(runOnMount)
  const [error, setError]     = useState<ApiError | null>(null)
  const mountedRef             = useRef(true)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (mountedRef.current) setData(result)
    } catch (err) {
      if (mountedRef.current) setError(err as ApiError)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    mountedRef.current = true
    if (runOnMount) run()
    return () => { mountedRef.current = false }
  }, [run, runOnMount])

  return { data, loading, error, refetch: run }
}

// ─────────────────────────────────────────────────────────────
// Domain-specific hooks
// ─────────────────────────────────────────────────────────────

/** Fetch all suppliers */
export function useSuppliers(): AsyncState<SupplierListResponse> {
  const fetcher = useCallback(() => api.suppliers.list(), [])
  return useAsync(fetcher)
}

/** Fetch supplier capacity utilization */
export function useCapacities(): AsyncState<CapacityListResponse> {
  const fetcher = useCallback(() => api.suppliers.capacities(), [])
  return useAsync(fetcher)
}

/** Fetch current demand plan */
export function useDemand(): AsyncState<DemandResponse> {
  const fetcher = useCallback(() => api.demand.get(), [])
  return useAsync(fetcher)
}

/** Fetch spend breakdown for the pie chart */
export function useSpendBreakdown(): AsyncState<SpendBreakdown[]> {
  const fetcher = useCallback(() => api.pricing.spendBreakdown(), [])
  return useAsync(fetcher)
}

/** Fetch all purchase orders */
export function usePurchaseOrders(): AsyncState<PurchaseOrderListResponse> {
  const fetcher = useCallback(() => api.purchaseOrders.list(), [])
  return useAsync(fetcher)
}

/**
 * Run a quick optimization on demand.
 * Does NOT auto-run on mount — call `refetch()` when the user triggers it.
 */
export function useOptimization(strategy: OptimizationStrategy = 'cost_minimization') {
  const [data, setData]       = useState<OptimizationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<ApiError | null>(null)

  const run = useCallback(async (overrideStrategy?: OptimizationStrategy) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.optimization.quick(overrideStrategy ?? strategy)
      setData(result)
      return result
    } catch (err) {
      setError(err as ApiError)
      return null
    } finally {
      setLoading(false)
    }
  }, [strategy])

  return { data, loading, error, run }
}

/**
 * Run a scenario simulation on demand.
 * Does NOT auto-run on mount — call `simulate(payload)` when the user triggers it.
 */
export function useScenario() {
  const [data, setData]       = useState<ScenarioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<ApiError | null>(null)

  const simulate = useCallback(async (payload: ScenarioRequest) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.scenarios.simulate(payload)
      setData(result)
      return result
    } catch (err) {
      setError(err as ApiError)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, simulate }
}

/** Fetch full pricing matrix */
export function usePricing(): AsyncState<PricingResponse> {
  const fetcher = useCallback(() => api.pricing.get(), [])
  return useAsync(fetcher)
}

/** Fetch strategy comparison (all 4 strategies, side-by-side) */
export function useStrategyComparison(): AsyncState<StrategyComparisonResponse> {
  const fetcher = useCallback(() => api.optimization.compare(), [])
  // Don't auto-run — expensive; caller triggers with refetch()
  return useAsync(fetcher, false)
}

/** Manage supplier CRUD operations with local optimistic state */
export function useSupplierMutations() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<ApiError | null>(null)

  const createSupplier = useCallback(async (payload: SupplierUpsert): Promise<Supplier | null> => {
    setLoading(true); setError(null)
    try { return await api.suppliers.create(payload) }
    catch (e) { setError(e as ApiError); return null }
    finally { setLoading(false) }
  }, [])

  const updateSupplier = useCallback(async (id: string, payload: SupplierUpsert): Promise<Supplier | null> => {
    setLoading(true); setError(null)
    try { return await api.suppliers.update(id, payload) }
    catch (e) { setError(e as ApiError); return null }
    finally { setLoading(false) }
  }, [])

  const deleteSupplier = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true); setError(null)
    try { await api.suppliers.delete(id); return true }
    catch (e) { setError(e as ApiError); return false }
    finally { setLoading(false) }
  }, [])

  return { loading, error, createSupplier, updateSupplier, deleteSupplier }
}

/** Fetch current Nova API data store metadata */
export function useNovaStatus() {
  const [data, setData]       = useState<import('@/src/lib/api').NovaStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<ApiError | null>(null)
  const [syncing, setSyncing] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.nova.status()
      setData(result)
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-fetch on mount
  useEffect(() => { fetchStatus() }, [fetchStatus])

  const sync = useCallback(async () => {
    setSyncing(true)
    setError(null)
    try {
      const result = await api.nova.sync()
      setData(result)
      return result
    } catch (e) {
      setError(e as ApiError)
      return null
    } finally {
      setSyncing(false)
    }
  }, [])

  return { data, loading, error, syncing, refetch: fetchStatus, sync }
}
