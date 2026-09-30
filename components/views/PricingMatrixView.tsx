'use client'

import { RefreshCw } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ErrorBanner, Spinner } from '@/components/ui/feedback'
import { useDemand, usePricing, useSpendBreakdown, useSuppliers } from '@/src/lib/hooks'

const COLORS = ['#3b82f6','#14b8a6','#8b5cf6','#f59e0b','#ef4444','#10b981']

function SH({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
      <div>
        <p className="text-[13px] font-semibold text-zinc-800">{title}</p>
        {sub && <p className="text-[11px] text-zinc-400">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

import React from 'react'

export default function PricingMatrixView() {
  const { data: priceData, loading, error, refetch } = usePricing()
  const { data: supData  } = useSuppliers()
  const { data: demData  } = useDemand()
  const { data: spendData } = useSpendBreakdown()

  const entries   = priceData?.entries  ?? []
  const suppliers = supData?.suppliers  ?? []
  const skus      = demData?.demands    ?? []

  // matrix: sku → supplier → { base, logistics, tco }
  const matrix: Record<string, Record<string, { base: number; logistics: number; tco: number }>> = {}
  skus.forEach(s => { matrix[s.sku_id] = {} })
  entries.forEach(e => {
    if (!matrix[e.sku_id]) matrix[e.sku_id] = {}
    matrix[e.sku_id][e.supplier_id] = { base: e.base_price, logistics: e.logistics_cost, tco: e.base_price + e.logistics_cost }
  })
  const bestPerSku: Record<string, number> = {}
  Object.entries(matrix).forEach(([sku, sm]) => {
    const vals = Object.values(sm).map(v => v.tco)
    if (vals.length) bestPerSku[sku] = Math.min(...vals)
  })

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Pricing Matrix</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">Cost & TCO Overview</h2>
          <p className="mt-0.5 text-xs text-zinc-400">Unit price + logistics · {entries.length} vendor–SKU pairs</p>
        </div>
        <button onClick={refetch} className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
          <RefreshCw className="size-3" />Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error.detail} />}

      {/* top row: spend pie + supplier summary */}
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        {/* spend donut */}
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <SH title="Spend distribution" sub="% of total by vendor" />
          <div className="flex items-center gap-4 p-4">
            <div className="h-32 w-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={spendData ?? []} dataKey="value" nameKey="name" innerRadius={36} outerRadius={56} paddingAngle={2} strokeWidth={0}>
                    {(spendData ?? []).map((e, i) => <Cell key={e.name} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {(spendData ?? []).map((e, i) => (
                <div key={e.name} className="flex items-center gap-2 text-xs">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 truncate text-zinc-500 max-w-[100px]">{e.name}</span>
                  <span className="num font-semibold text-zinc-700 tabular-nums">{e.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* supplier avg TCO */}
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <SH title="Vendor cost summary" sub="Average TCO per unit across all SKUs" />
          <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {suppliers.map((s, i) => {
              const sEntries = entries.filter(e => e.supplier_id === s.id)
              const avg = sEntries.length ? sEntries.reduce((sum, e) => sum + e.base_price + e.logistics_cost, 0) / sEntries.length : null
              return (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-zinc-800">{s.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-zinc-400">{s.payment_terms?.replace('_',' ')} · {s.lead_time_days}d</p>
                  </div>
                  <div className="shrink-0 text-right ml-2">
                    <p className="num text-sm font-semibold text-zinc-900">{avg !== null ? `₹${avg.toFixed(0)}` : '—'}</p>
                    <p className="text-[9px] text-zinc-400">avg TCO</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* TCO matrix table */}
      {loading ? <div className="flex h-40 items-center justify-center"><Spinner cls="size-5" /></div> : (
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
          <SH
            title="TCO matrix"
            sub="Base + logistics per unit. Green cell = cheapest for that SKU."
          />
          <div className="overflow-x-auto">
            <table className="table-editorial w-full">
              <thead>
                <tr>
                  <th className="pl-4 min-w-[180px]">SKU</th>
                  {suppliers.map((s, i) => (
                    <th key={s.id} className="text-center min-w-[110px]">
                      <div className="flex flex-col items-center">
                        <span title={s.name} style={{ color: COLORS[i % COLORS.length] }}>
                          {s.name.split(' ')[0]}
                        </span>
                        <span className="font-normal text-zinc-400" style={{ fontSize: 9 }}>
                          {s.lead_time_days}d · {s.reliability_score}% rel
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skus.map(sku => (
                  <tr key={sku.sku_id}>
                    <td className="pl-4">
                      <p className="text-xs font-semibold text-zinc-800 truncate max-w-[160px]">{sku.sku_name}</p>
                      <p className="font-mono text-[10px] text-zinc-400">{sku.sku_id}</p>
                    </td>
                    {suppliers.map(s => {
                      const cell = matrix[sku.sku_id]?.[s.id]
                      const best = cell && cell.tco === bestPerSku[sku.sku_id]
                      return (
                        <td key={s.id} className="text-center">
                          {cell ? (
                            <div className={`inline-block rounded px-2 py-1 ${best ? 'bg-emerald-50 ring-1 ring-emerald-300/60' : ''}`}>
                              <p className={`num text-xs font-semibold ${best ? 'text-emerald-700' : 'text-zinc-700'}`}>
                                ₹{cell.tco.toFixed(0)}{best && <span className="ml-0.5 text-[9px]">✓</span>}
                              </p>
                              <p className="text-[9px] text-zinc-400">
                                ₹{cell.base.toFixed(0)} + {cell.logistics.toFixed(0)}
                              </p>
                            </div>
                          ) : <span className="text-zinc-200">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* tier cards */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Volume discount tiers</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s, si) => (
            <div key={s.id} className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-800">{s.name}</p>
                <span className="text-[10px] text-zinc-400">MOQ: {s.moq} · Max: {s.max_order_qty || '∞'}</span>
              </div>
              {s.tiered_pricing.length === 0 ? (
                <p className="text-[11px] text-zinc-400">Flat pricing — no tiers configured</p>
              ) : (
                <div className="space-y-1">
                  {s.tiered_pricing.map((tier, ti) => {
                    const next = s.tiered_pricing[ti + 1]
                    const range = ti === 0
                      ? `0 – ${next ? (next.min_qty - 1).toLocaleString() : '∞'} units`
                      : next
                        ? `${tier.min_qty.toLocaleString()} – ${(next.min_qty - 1).toLocaleString()} units`
                        : `≥ ${tier.min_qty.toLocaleString()} units`
                    return (
                      <div key={ti} className="flex items-center justify-between rounded bg-zinc-50 px-2.5 py-1.5">
                        <span className="text-[11px] text-zinc-500">{range}</span>
                        <span className="num text-xs font-semibold text-zinc-800">₹{tier.price_per_unit.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
