'use client'

import { useState } from 'react'
import { BarChart2, CheckCircle2, ClipboardList, Download, RefreshCw, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorBanner, Spinner, SuccessBanner } from '@/components/ui/feedback'
import { useOptimization, useStrategyComparison } from '@/src/lib/hooks'
import { api } from '@/src/lib/api'
import type { OptimizationStrategy } from '@/src/types/procurement'

const STRATEGIES: { value: OptimizationStrategy; label: string; desc: string }[] = [
  { value: 'cost_minimization',      label: 'Cost Min',      desc: 'Minimise total cost of ownership' },
  { value: 'lead_time_minimization', label: 'Lead Time Min', desc: 'Minimise weighted average lead time' },
  { value: 'balanced_risk',          label: 'Balanced Risk', desc: 'Cost with ≤70% per-vendor cap' },
  { value: 'dual_sourcing',          label: 'Dual Sourcing', desc: 'Force ≥20% secondary-vendor share' },
]

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

function exportCSV(rows: object[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => (r as Record<string,unknown>)[h] ?? '').join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: 'allocation_plan.csv' }).click()
  URL.revokeObjectURL(url)
}

import React from 'react'

export default function OptimizationView() {
  const [strategy, setStrategy] = useState<OptimizationStrategy>('cost_minimization')
  const { data: result, loading, error, run } = useOptimization(strategy)
  const { data: comparison, loading: cmpLoading, error: cmpError, refetch: runCompare } = useStrategyComparison()
  const [genLoading, setGenLoading] = useState(false)
  const [genMsg, setGenMsg]         = useState<string | null>(null)
  const [genErr, setGenErr]         = useState<string | null>(null)

  async function handleGen() {
    if (!result?.allocations.length) return
    setGenLoading(true); setGenMsg(null); setGenErr(null)
    try {
      const r = await api.purchaseOrders.generate(result.allocations)
      setGenMsg(`Generated ${r.total} purchase orders — ₹${r.total_value.toLocaleString()} total`)
    } catch (e: unknown) {
      setGenErr((e as { detail?: string })?.detail ?? 'Failed to generate POs')
    } finally { setGenLoading(false) }
  }

  const compRows = comparison?.rows ?? []

  return (
    <div className="space-y-4">
      {/* header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Optimization Runs</p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">MILP Solver</h2>
        <p className="mt-0.5 text-xs text-zinc-400">Select a strategy and run the solver against live Nova API data</p>
      </div>

      {/* strategy selector */}
      <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <SH title="Select strategy" />
        <div className="p-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {STRATEGIES.map(s => (
              <button key={s.value} type="button" onClick={() => setStrategy(s.value)}
                className={`rounded-lg border p-3 text-left transition-all ${strategy === s.value ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400/60' : 'border-zinc-200 bg-zinc-50/40 hover:border-zinc-300'}`}>
                <p className={`text-xs font-semibold ${strategy === s.value ? 'text-blue-700' : 'text-zinc-700'}`}>{s.label}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">{s.desc}</p>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run(strategy)} disabled={loading}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:scale-[0.97] transition-all disabled:opacity-50">
              {loading ? <><Spinner />Solving…</> : <><Zap className="size-3.5" />Run solver</>}
            </button>
            <button onClick={() => runCompare()} disabled={cmpLoading}
              className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
              {cmpLoading ? <><Spinner />Comparing…</> : <><BarChart2 className="size-3.5" />Compare all</>}
            </button>
          </div>
          {error    && <ErrorBanner message={error.detail} />}
          {cmpError && <ErrorBanner message={cmpError.detail} />}
        </div>
      </div>

      {/* strategy comparison table */}
      {compRows.length > 0 && (
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
          <SH title="Strategy comparison" sub="All 4 strategies on same data · best values marked ✓" />
          <div className="overflow-x-auto">
            <table className="table-editorial w-full">
              <thead>
                <tr>
                  <th className="pl-4">Strategy</th>
                  <th>Status</th>
                  <th className="text-right">Total cost</th>
                  <th className="text-right">Fulfillment</th>
                  <th className="text-right">Lead time</th>
                  <th className="text-right">Vendors</th>
                  <th className="pr-4 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {compRows.map(row => {
                  const bc = row.strategy === comparison?.best_cost_strategy
                  const bl = row.strategy === comparison?.best_lead_time_strategy
                  const bf = row.strategy === comparison?.best_fulfillment_strategy
                  const active = row.strategy === strategy
                  return (
                    <tr key={row.strategy} className={active ? 'bg-blue-50/40' : ''}>
                      <td className="pl-4">
                        <p className="text-xs font-medium capitalize text-zinc-700">{row.strategy.replace(/_/g,' ')}</p>
                      </td>
                      <td>
                        <span className={`flex items-center gap-1 text-[11px] font-medium ${row.status === 'optimal' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {row.status === 'optimal' ? <CheckCircle2 className="size-3" /> : null}
                          {row.status}
                        </span>
                      </td>
                      <td className="text-right"><span className={`num text-xs ${bc ? 'font-bold text-emerald-700' : 'text-zinc-700'}`}>₹{row.total_cost.toLocaleString()} {bc && '✓'}</span></td>
                      <td className="text-right"><span className={`num text-xs ${bf ? 'font-bold text-emerald-700' : 'text-zinc-700'}`}>{row.demand_fulfillment_pct}% {bf && '✓'}</span></td>
                      <td className="text-right"><span className={`num text-xs ${bl ? 'font-bold text-emerald-700' : 'text-zinc-700'}`}>{row.weighted_lead_time_days}d {bl && '✓'}</span></td>
                      <td className="text-right"><span className="num text-xs text-zinc-500">{row.supplier_count_used}</span></td>
                      <td className="pr-4 text-right"><span className="num text-xs text-zinc-500">{row.total_units_allocated.toLocaleString()}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* results */}
      {result && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'Total cost',  v: `₹${result.summary.total_cost.toLocaleString()}` },
              { l: 'Units',       v: result.summary.total_units_allocated.toLocaleString() },
              { l: 'Fulfillment', v: `${result.summary.demand_fulfillment_pct}%` },
              { l: 'Avg lead',    v: `${result.summary.weighted_lead_time_days}d` },
            ].map(m => (
              <div key={m.l} className="rounded-lg border border-zinc-200/80 bg-white p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">{m.l}</p>
                <p className="num mt-1 text-xl font-semibold tracking-tight text-zinc-900">{m.v}</p>
              </div>
            ))}
          </div>

          {/* spend bar */}
          {result.spend_by_supplier.length > 0 && (
            <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
              <SH title="Spend by vendor" sub="% share from this run" />
              <div className="px-4 pb-4 pt-2 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.spend_by_supplier} margin={{ left: -10, right: 4 }}>
                    <CartesianGrid vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => v.split(' ')[0]} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="value" radius={[3,3,0,0]} maxBarSize={40}>
                      {result.spend_by_supplier.map(e => <Cell key={e.name} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* allocation table */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
            <SH
              title="Allocation plan"
              sub={`Solver: ${result.status}${result.solver_message ? ' — ' + result.solver_message : ''}`}
              right={
                <div className="flex gap-2">
                  <button onClick={() => exportCSV(result.allocations)}
                    className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                    <Download className="size-3" />CSV
                  </button>
                  <button onClick={handleGen} disabled={genLoading}
                    className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {genLoading ? <RefreshCw className="size-3 animate-spin" /> : <ClipboardList className="size-3" />}
                    Gen POs
                  </button>
                </div>
              }
            />
            {genMsg && <div className="px-4 py-2"><SuccessBanner message={genMsg} /></div>}
            {genErr && <div className="px-4 py-2"><ErrorBanner message={genErr} /></div>}
            <div className="overflow-x-auto">
              <table className="table-editorial w-full">
                <thead>
                  <tr>
                    <th className="pl-4">Supplier</th>
                    <th>SKU</th>
                    <th>Period</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit</th>
                    <th className="text-right">Logistics</th>
                    <th className="text-right">Total</th>
                    <th className="pr-4 text-right">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {result.allocations.map((line, i) => (
                    <tr key={i}>
                      <td className="pl-4 text-xs font-medium text-zinc-700 max-w-[140px] truncate">{line.supplier_name.split(' ').slice(0,2).join(' ')}</td>
                      <td className="text-zinc-500 max-w-[120px] truncate">{line.sku_name}</td>
                      <td><span className="font-mono text-[11px] text-zinc-500">{line.period}</span></td>
                      <td className="text-right"><span className="num text-xs font-semibold text-zinc-800">{line.quantity.toLocaleString()}</span></td>
                      <td className="text-right"><span className="num text-xs text-zinc-500">₹{line.unit_cost.toFixed(2)}</span></td>
                      <td className="text-right"><span className="num text-xs text-zinc-400">₹{line.logistics_cost.toFixed(2)}</span></td>
                      <td className="text-right"><span className="num text-xs font-semibold text-zinc-800">₹{line.total_cost.toLocaleString()}</span></td>
                      <td className="pr-4 text-right"><span className="num text-xs text-zinc-400">{line.lead_time_days}d</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
