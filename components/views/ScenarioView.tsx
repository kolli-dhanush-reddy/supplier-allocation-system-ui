'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, BarChart2, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ErrorBanner, Spinner, WarningBanner } from '@/components/ui/feedback'
import { useScenario, useSuppliers } from '@/src/lib/hooks'
import type { DisruptionType, OptimizationStrategy } from '@/src/types/procurement'

const DISRUPTIONS: { value: DisruptionType; label: string; desc: string }[] = [
  { value: 'supplier_disruption', label: 'Supplier offline',  desc: 'Zero out one or more vendor capacities' },
  { value: 'price_inflation',     label: 'Price inflation',   desc: 'Scale all prices by a multiplier' },
  { value: 'demand_surge',        label: 'Demand surge',      desc: 'Scale all demand quantities' },
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

export default function ScenarioView() {
  const { data: supData }                          = useSuppliers()
  const { data: result, loading, error, simulate } = useScenario()

  const [strategy, setStrategy]         = useState<OptimizationStrategy>('cost_minimization')
  const [disruption, setDisruption]     = useState<DisruptionType>('supplier_disruption')
  const [disruptedIds, setDisruptedIds] = useState<string[]>([])
  const [priceFactor, setPriceFactor]   = useState(1.15)
  const [demandFactor, setDemandFactor] = useState(1.30)
  const [scenName, setScenName]         = useState('')
  const [stale, setStale]               = useState(false)

  const suppliers    = supData?.suppliers ?? []
  const missingSup   = disruption === 'supplier_disruption' && disruptedIds.length === 0

  useEffect(() => { if (result) setStale(true) }, [strategy, disruption, disruptedIds, priceFactor, demandFactor])

  function autoName() {
    if (disruption === 'supplier_disruption') {
      const names = suppliers.filter(s => disruptedIds.includes(s.id)).map(s => s.name.split(' ')[0])
      return `${names.join('+') || 'vendors'} offline`
    }
    if (disruption === 'price_inflation') return `Prices +${((priceFactor-1)*100).toFixed(0)}%`
    return `Demand +${((demandFactor-1)*100).toFixed(0)}%`
  }

  async function handleRun() {
    if (missingSup) return
    setStale(false)
    await simulate({
      base_request: { strategy },
      disruption_type: disruption,
      disrupted_supplier_ids: disruption === 'supplier_disruption' ? disruptedIds : [],
      price_inflation_factor: disruption === 'price_inflation' ? priceFactor : 1.0,
      demand_surge_factor:    disruption === 'demand_surge'    ? demandFactor : 1.0,
      scenario_name: scenName.trim() || autoName(),
    })
  }

  // normalised % change chart
  const chartData = result ? [
    { metric: 'Cost',        change: result.cost_delta_pct, good: result.cost_delta_pct <= 0 },
    { metric: 'Fulfillment', change: result.fulfillment_delta_pct, good: result.fulfillment_delta_pct >= 0 },
    {
      metric: 'Lead time',
      change: result.lead_time_delta_days > 0
        ? +((result.lead_time_delta_days / (result.baseline.summary.weighted_lead_time_days || 1)) * 100).toFixed(1)
        : 0,
      good: result.lead_time_delta_days <= 0,
    },
    {
      metric: 'Vendors',
      change: result.baseline.summary.supplier_count_used > 0
        ? +((result.simulated.summary.supplier_count_used - result.baseline.summary.supplier_count_used) /
            result.baseline.summary.supplier_count_used * 100).toFixed(1)
        : 0,
      good: result.simulated.summary.supplier_count_used >= result.baseline.summary.supplier_count_used,
    },
  ] : []

  const riskLevel = result
    ? result.cost_delta_pct > 20 || result.fulfillment_delta_pct < -10 ? 'high'
    : result.cost_delta_pct > 5  || result.fulfillment_delta_pct < -2  ? 'medium' : 'low'
    : 'low'

  return (
    <div className="space-y-4">
      {/* header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Scenario Analysis</p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">Disruption Simulator</h2>
        <p className="mt-0.5 text-xs text-zinc-400">Model supply chain disruptions and measure their cost, fulfillment, and lead-time impact</p>
      </div>

      {/* config */}
      <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <SH title="Configure scenario" />
        <div className="space-y-4 p-4">

          {/* name */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
              Scenario name <span className="font-normal normal-case text-zinc-300">(optional)</span>
            </label>
            <input
              className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-800 placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={autoName()}
              value={scenName}
              onChange={e => setScenName(e.target.value)}
            />
          </div>

          {/* strategy */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">Base strategy</p>
            <div className="flex flex-wrap gap-1.5">
              {(['cost_minimization','lead_time_minimization','balanced_risk','dual_sourcing'] as OptimizationStrategy[]).map(s => (
                <button key={s} type="button" onClick={() => setStrategy(s)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${strategy === s ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
                  {s.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          {/* disruption type */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">Disruption type</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {DISRUPTIONS.map(d => (
                <button key={d.value} type="button" onClick={() => setDisruption(d.value)}
                  className={`rounded-lg border p-3 text-left transition-all duration-150 ${disruption === d.value ? 'border-rose-400/60 bg-rose-50/60 ring-1 ring-rose-300/40' : 'border-zinc-200 bg-zinc-50/30 hover:border-zinc-300 hover:bg-zinc-50'}`}>
                  <p className={`text-xs font-semibold ${disruption === d.value ? 'text-rose-700' : 'text-zinc-700'}`}>{d.label}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400 leading-relaxed">{d.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* vendor selector */}
          {disruption === 'supplier_disruption' && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
                Disrupted vendors <span className="font-normal text-zinc-300">· select one or more</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suppliers.map(s => {
                  const on = disruptedIds.includes(s.id)
                  return (
                    <button key={s.id} type="button"
                      onClick={() => setDisruptedIds(prev => prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id])}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'border-rose-500 bg-rose-500 text-white' : 'border-zinc-200 text-zinc-600 hover:border-rose-300'}`}>
                      {s.name.split(' ')[0]}
                      {on && <span className="ml-1 opacity-70">✕</span>}
                    </button>
                  )
                })}
              </div>
              {missingSup && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-600">
                  <AlertTriangle className="size-3" />Select at least one vendor
                </p>
              )}
            </div>
          )}

          {/* price slider */}
          {disruption === 'price_inflation' && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
                Price multiplier — <span className="font-mono text-blue-600">{priceFactor.toFixed(2)}×</span>
                <span className="ml-2 font-normal normal-case text-zinc-400">+{((priceFactor-1)*100).toFixed(0)}% increase</span>
              </p>
              <input type="range" min={1} max={2.5} step={0.05} value={priceFactor}
                onChange={e => setPriceFactor(parseFloat(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-[10px] text-zinc-400"><span>1.0×</span><span>2.5×</span></div>
            </div>
          )}

          {/* demand slider */}
          {disruption === 'demand_surge' && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
                Demand multiplier — <span className="font-mono text-blue-600">{demandFactor.toFixed(2)}×</span>
                <span className="ml-2 font-normal normal-case text-zinc-400">+{((demandFactor-1)*100).toFixed(0)}% surge</span>
              </p>
              <input type="range" min={1} max={3} step={0.05} value={demandFactor}
                onChange={e => setDemandFactor(parseFloat(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-[10px] text-zinc-400"><span>1.0×</span><span>3.0×</span></div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={handleRun} disabled={loading || missingSup}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:scale-[0.97] transition-all disabled:opacity-50">
              {loading ? <><Spinner />Simulating…</> : <><Sparkles className="size-3.5" />Run simulation</>}
            </button>
            {result && (
              <button type="button" onClick={() => window.location.reload()}
                className="text-[11px] text-zinc-400 hover:text-zinc-600 underline underline-offset-2">
                Clear results
              </button>
            )}
          </div>
          {error && <ErrorBanner message={error.detail ?? error} />}
        </div>
      </div>

      {/* stale warning */}
      {result && stale && <WarningBanner message="Configuration changed — re-run to update results." />}

      {/* results */}
      {result && !stale && (
        <>
          {/* risk banner */}
          <div className={`rounded-lg border px-4 py-3 ${
            riskLevel === 'high'   ? 'border-rose-200/60 bg-rose-50/50' :
            riskLevel === 'medium' ? 'border-amber-200/60 bg-amber-50/50' :
                                     'border-emerald-200/60 bg-emerald-50/50'
          }`}>
            <div className="flex items-start gap-2.5">
              {riskLevel === 'low'
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                : <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${riskLevel === 'high' ? 'text-rose-500' : 'text-amber-500'}`} />
              }
              <div>
                <p className="text-xs font-semibold text-zinc-800">{result.scenario_name}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{result.risk_assessment}</p>
              </div>
            </div>
          </div>

          {/* delta KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { l: 'Cost impact',     v: `${result.cost_delta_pct > 0 ? '+' : ''}${result.cost_delta_pct}%`,         sub: `₹${Math.abs(result.cost_delta).toLocaleString()} ${result.cost_delta >= 0 ? 'more' : 'less'}`, danger: result.cost_delta_pct > 10, good: result.cost_delta_pct < 0 },
              { l: 'Fulfillment',     v: `${result.fulfillment_delta_pct >= 0 ? '+' : ''}${result.fulfillment_delta_pct}%`, sub: `${result.simulated.summary.demand_fulfillment_pct}% simulated`, danger: result.fulfillment_delta_pct < -5, good: result.fulfillment_delta_pct > 0 },
              { l: 'Lead time',       v: `${result.lead_time_delta_days >= 0 ? '+' : ''}${result.lead_time_delta_days}d`, sub: `${result.simulated.summary.weighted_lead_time_days}d avg`, danger: result.lead_time_delta_days > 5, good: result.lead_time_delta_days < 0 },
              { l: 'Vendors avail.',  v: String(result.simulated.summary.supplier_count_used),                          sub: `vs. ${result.baseline.summary.supplier_count_used} baseline`, danger: result.simulated.summary.supplier_count_used < result.baseline.summary.supplier_count_used, good: result.simulated.summary.supplier_count_used >= result.baseline.summary.supplier_count_used },
            ].map(m => (
              <div key={m.l} className={`rounded-lg border p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ${m.danger ? 'border-rose-200/60 bg-rose-50/40' : m.good ? 'border-emerald-200/60 bg-emerald-50/30' : 'border-zinc-200/80 bg-white'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">{m.l}</p>
                <p className={`num mt-1 text-2xl font-semibold tracking-tight ${m.danger ? 'text-rose-700' : m.good ? 'text-emerald-700' : 'text-zinc-900'}`}>{m.v}</p>
                <p className="mt-1 text-[11px] text-zinc-400">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* normalised impact chart */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <SH
              title="Impact vs. baseline"
              sub="% change from baseline · green = improvement · red = deterioration"
            />
            <div className="px-4 pb-4 pt-2 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -10, right: 4 }}>
                  <CartesianGrid vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} />
                  <Tooltip formatter={(v: any) => [`${Number(v) > 0 ? '+' : ''}${v}%`, '% change']} cursor={{ fill: '#f9f9fb' }} />
                  <ReferenceLine y={0} stroke="#d4d4d8" strokeWidth={1} />
                  <Bar dataKey="change" radius={[3,3,0,0]} maxBarSize={60}>
                    {chartData.map((e, i) => (
                      <Cell key={i} fill={e.change === 0 ? '#d4d4d8' : e.good ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 border-t border-zinc-100 px-4 py-2">
              {[{ c: '#10b981', l: 'Improvement' }, { c: '#ef4444', l: 'Deterioration' }, { c: '#d4d4d8', l: 'No change' }].map(({ c, l }) => (
                <span key={l} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <span className="size-2 rounded-full" style={{ background: c }} />{l}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
