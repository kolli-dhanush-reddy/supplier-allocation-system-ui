'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Package, RefreshCw, Search, TrendingUp } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ErrorBanner, Spinner } from '@/components/ui/feedback'
import { useDemand } from '@/src/lib/hooks'
import type { SKUDemand } from '@/src/types/procurement'

const COLORS = ['#3b82f6','#14b8a6','#8b5cf6','#f59e0b','#ef4444','#10b981','#f97316','#06b6d4','#ec4899','#84cc16']
const MAX_CHART = 8
const PER_PAGE  = 9

// ── tooltip ───────────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const rows  = [...payload].filter(p => p.value > 0).sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, p) => s + p.value, 0)
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 8, padding: '10px 12px', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', pointerEvents: 'none' }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a1a1aa', marginBottom: 7 }}>{label}</p>
      {rows.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: '#18181b', fontVariantNumeric: 'tabular-nums' }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div style={{ marginTop: 7, paddingTop: 6, borderTop: '1px solid #f4f4f5', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
          <span style={{ color: '#a1a1aa' }}>Total</span>
          <span style={{ fontWeight: 700, color: '#18181b' }}>{total.toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}

function buildChart(demands: SKUDemand[]) {
  const periods = [...new Set(demands.flatMap(d => d.periods.map(p => p.period)))].sort()
  return periods.map(period => {
    const row: Record<string, string | number> = { period }
    demands.forEach(d => {
      const p = d.periods.find(p => p.period === period)
      row[d.sku_name] = p?.quantity ?? 0
    })
    return row
  })
}

// ── section header ────────────────────────────────────────────────────────────
function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
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

export default function DemandPlanningView() {
  const { data, loading, error, refetch } = useDemand()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch]     = useState('')
  const [page, setPage]         = useState(0)

  const demands    = data?.demands ?? []
  const totalUnits = data?.total_units ?? 0

  const defaultSel  = useMemo(() => new Set(demands.slice(0, 5).map(d => d.sku_id)), [demands])
  const activeSel   = selected.size > 0 ? selected : defaultSel
  const chartDems   = demands.filter(d => activeSel.has(d.sku_id)).slice(0, MAX_CHART)
  const chartData   = useMemo(() => buildChart(chartDems), [chartDems])
  const atLimit     = activeSel.size >= MAX_CHART

  const visible = useMemo(() => {
    const q = search.toLowerCase()
    return demands.filter(d => !q || d.sku_name.toLowerCase().includes(q) || d.sku_id.toLowerCase().includes(q))
  }, [demands, search])
  const pages  = Math.ceil(visible.length / PER_PAGE)
  const paged  = visible.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  function toggle(id: string) {
    setSelected(prev => {
      const base = prev.size === 0 ? new Set(defaultSel) : new Set(prev)
      if (base.has(id)) { if (base.size > 1) base.delete(id) }
      else { if (base.size < MAX_CHART) base.add(id) }
      return base
    })
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Demand Planning</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">SKU Demand Forecast</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {data?.total_skus ?? 0} SKUs · {totalUnits.toLocaleString()} units · {data?.planning_horizon_weeks ?? 6}-week horizon
          </p>
        </div>
        <button onClick={refetch} className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
          <RefreshCw className="size-3" />Refresh
        </button>
      </div>

      {loading && <div className="flex h-40 items-center justify-center"><Spinner cls="size-5" /></div>}
      {error   && <ErrorBanner message={error.detail} />}

      {!loading && !error && demands.length > 0 && (
        <>
          {/* chart card */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <SectionHead
              title="Demand by period"
              sub={`Showing ${chartDems.length}/${demands.length} SKUs · max ${MAX_CHART}`}
              right={
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setSelected(new Set(demands.slice(0, MAX_CHART).map(d => d.sku_id)))} className="text-blue-600 hover:underline">First {MAX_CHART}</button>
                  <span className="text-zinc-300">·</span>
                  <button onClick={() => setSelected(new Set(demands.slice(0, 5).map(d => d.sku_id)))} className="text-zinc-400 hover:underline">Reset</button>
                </div>
              }
            />
            {/* chips */}
            <div className="flex flex-wrap gap-1.5 border-b border-zinc-100 px-4 py-3">
              {demands.map((d, i) => {
                const color   = COLORS[i % COLORS.length]
                const checked = activeSel.has(d.sku_id)
                const disabled = !checked && atLimit
                return (
                  <button
                    key={d.sku_id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(d.sku_id)}
                    title={disabled ? `Remove a SKU first (max ${MAX_CHART})` : d.sku_name}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                      checked  ? 'border-transparent text-white' :
                      disabled ? 'cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300' :
                                 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
                    }`}
                    style={checked ? { background: color, borderColor: color } : {}}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: checked ? 'rgba(255,255,255,0.7)' : color, flexShrink: 0, display: 'inline-block' }} />
                    {d.sku_name.length > 20 ? d.sku_name.slice(0, 20) + '…' : d.sku_name}
                  </button>
                )
              })}
            </div>
            {/* chart */}
            <div className="px-4 pb-4 pt-2">
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ left: -10, right: 4, top: 4 }}
                    barCategoryGap={chartDems.length > 6 ? '25%' : '20%'} barGap={1}>
                    <CartesianGrid vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: '#f9f9fb' }} position={{ y: 8 }} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ zIndex: 50 }} />
                    {chartDems.map((d, idx) => {
                      const gi   = demands.findIndex(x => x.sku_id === d.sku_id)
                      const size = Math.max(12, Math.floor(160 / Math.max(chartDems.length, 1)))
                      return (
                        <Bar key={d.sku_id} dataKey={d.sku_name} fill={COLORS[gi % COLORS.length]} radius={[3,3,0,0]} maxBarSize={size} />
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* search */}
          <div className="flex items-center gap-3">
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Search SKUs…"
                className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-zinc-400">{visible.length} SKUs</p>
          </div>

          {/* SKU cards — compact */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map(d => {
              const i     = demands.findIndex(x => x.sku_id === d.sku_id)
              const color = COLORS[i % COLORS.length]
              const total = d.periods.reduce((s, p) => s + p.quantity, 0)
              const peak  = Math.max(...d.periods.map(p => p.quantity))
              return (
                <div key={d.sku_id} className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
                  <div className="flex items-start justify-between">
                    <div className="flex size-7 items-center justify-center rounded-md" style={{ background: `${color}18` }}>
                      <Package className="size-3.5" style={{ color }} />
                    </div>
                    {d.category && (
                      <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{d.category}</span>
                    )}
                  </div>
                  <p className="mt-2.5 text-[10px] font-mono font-medium text-zinc-400">{d.sku_id}</p>
                  <p className="mt-0.5 text-sm font-semibold leading-snug text-zinc-800 line-clamp-1">{d.sku_name}</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    {[
                      { l: 'Demand',  v: total.toLocaleString() },
                      { l: 'Peak',    v: peak.toLocaleString() },
                      { l: 'Safety',  v: `+${d.safety_stock.toLocaleString()}`, cls: 'text-amber-600' },
                      { l: 'Required', v: (total + d.safety_stock).toLocaleString(), cls: 'font-semibold text-zinc-800' },
                    ].map(({ l, v, cls = 'text-zinc-700' }) => (
                      <div key={l}>
                        <p className="text-[10px] text-zinc-400">{l}</p>
                        <p className={`num ${cls}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                  {/* mini sparkline — bars only, no period labels */}
                  <div className="mt-3 flex items-end gap-0.5" style={{ height: 24 }}>
                    {d.periods.map(p => (
                      <div key={p.period} className="flex-1">
                        <div className="w-full rounded-sm" style={{
                          height: `${Math.max(3, Math.round((p.quantity / peak) * 100))}%`,
                          background: color, opacity: 0.55,
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400">
                {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, visible.length)} of {visible.length}
              </p>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 disabled:opacity-30 hover:bg-zinc-50">
                  <ChevronLeft className="size-3" />Prev
                </button>
                {Array.from({ length: pages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className={`w-7 rounded-md border text-xs ${page === i ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
                    {i + 1}
                  </button>
                ))}
                <button disabled={page === pages - 1} onClick={() => setPage(p => p + 1)}
                  className="flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 disabled:opacity-30 hover:bg-zinc-50">
                  Next<ChevronRight className="size-3" />
                </button>
              </div>
            </div>
          )}

          {/* period table */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
            <SectionHead title="Period breakdown" sub="Weekly units · safety stock · required total" />
            <div className="overflow-x-auto">
              <table className="table-editorial w-full">
                <thead>
                  <tr>
                    <th className="pl-4">SKU</th>
                    <th>Category</th>
                    {demands[0]?.periods.map(p => <th key={p.period} className="text-right">{p.period}</th>)}
                    <th className="text-right">Safety</th>
                    <th className="pr-4 text-right">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(d => {
                    const i     = demands.findIndex(x => x.sku_id === d.sku_id)
                    const color = COLORS[i % COLORS.length]
                    const total = d.periods.reduce((s, p) => s + p.quantity, 0)
                    const peak  = Math.max(...d.periods.map(p => p.quantity))
                    return (
                      <tr key={d.sku_id}>
                        <td className="pl-4">
                          <div className="flex items-center gap-2">
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
                            <div>
                              <p className="text-xs font-medium text-zinc-700 truncate max-w-[160px]">{d.sku_name}</p>
                              <p className="font-mono text-[10px] text-zinc-400">{d.sku_id}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{d.category ?? '—'}</span>
                        </td>
                        {d.periods.map(p => {
                          const pct = peak > 0 ? p.quantity / peak : 0
                          return (
                            <td key={p.period} className="text-right">
                              <span className="num inline-block rounded px-1 py-0.5 text-xs"
                                style={{ background: `${color}${Math.round(pct * 22).toString(16).padStart(2,'0')}`, color: pct > 0.6 ? color : '#52525b' }}>
                                {p.quantity.toLocaleString()}
                              </span>
                            </td>
                          )
                        })}
                        <td className="text-right">
                          <span className="num text-xs font-medium text-amber-600">+{d.safety_stock.toLocaleString()}</span>
                        </td>
                        <td className="pr-4 text-right">
                          <span className="num text-sm font-semibold text-zinc-900">{(total + d.safety_stock).toLocaleString()}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
