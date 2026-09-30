'use client'

import { useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, ArrowDownRight, Bell, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardList, Database, DollarSign,
  Download, FlaskConical, Gauge, LayoutDashboard, Loader2, Menu,
  MoreHorizontal, Package, Plus, RefreshCw, Search, Settings,
  ShieldCheck, Sparkles, Truck, Users, WifiOff, X, Zap,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Badge }     from '@/components/ui/badge'
import { Button }    from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress }  from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'

// ── view components ───────────────────────────────────────────────────────────
import DemandPlanningView   from '@/components/views/DemandPlanningView'
import SupplierCapacityView from '@/components/views/SupplierCapacityView'
import PricingMatrixView    from '@/components/views/PricingMatrixView'
import OptimizationView     from '@/components/views/OptimizationView'
import ProcurementPlanView  from '@/components/views/ProcurementPlanView'
import ScenarioView         from '@/components/views/ScenarioView'

// ── hooks ─────────────────────────────────────────────────────────────────────
import {
  useCapacities, useNovaStatus, useOptimization,
  usePurchaseOrders, useSpendBreakdown,
} from '@/src/lib/hooks'

// ── design helpers ────────────────────────────────────────────────────────────
const NAV = [
  { label: 'Executive dashboard', icon: LayoutDashboard },
  { label: 'Demand planning',     icon: Package },
  { label: 'Supplier management', icon: Users },
  { label: 'Pricing matrix',      icon: DollarSign },
  { label: 'Optimization runs',   icon: Zap },
  { label: 'Purchase orders',     icon: ClipboardList },
  { label: 'Scenario analysis',   icon: FlaskConical },
  { label: 'Settings',            icon: Settings },
]

// ── greeting ──────────────────────────────────────────────────────────────────
function greet() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
function todayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── tiny shared atoms ─────────────────────────────────────────────────────────
function Spinner({ cls = 'size-3.5' }: { cls?: string }) {
  return <Loader2 className={`animate-spin text-zinc-400 ${cls}`} />
}

function ErrBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-rose-200/60 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <AlertTriangle className="size-3.5 shrink-0" />{msg}
    </div>
  )
}

// ── status badge — minimal pill ───────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'In transit': 'bg-blue-50 text-blue-600 border-blue-200/70',
    Confirmed:    'bg-emerald-50 text-emerald-700 border-emerald-200/70',
    'At risk':    'bg-amber-50 text-amber-700 border-amber-200/70',
    Draft:        'bg-zinc-100 text-zinc-500 border-zinc-200/70',
    Delivered:    'bg-teal-50 text-teal-700 border-teal-200/70',
    Cancelled:    'bg-rose-50 text-rose-600 border-rose-200/70',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${map[status] ?? 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
      {status}
    </span>
  )
}

// ── metric card — editorial large number ──────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, trend = 'up',
}: {
  label: string; value: string; sub: string; icon: typeof Gauge; trend?: 'up' | 'down'
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : ArrowDownRight
  const trendCls  = trend === 'up'
    ? 'text-emerald-600 bg-emerald-50 border-emerald-200/60'
    : 'text-sky-600 bg-sky-50 border-sky-200/60'   // down = faster = positive = sky

  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      {/* top row: icon left, trend badge right */}
      <div className="flex items-center justify-between mb-3">
        <span className="flex size-6 items-center justify-center rounded bg-zinc-100 text-zinc-400">
          <Icon className="size-3" />
        </span>
        <span className={`flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${trendCls}`}>
          <TrendIcon className="size-2.5" />
        </span>
      </div>
      {/* number */}
      <p className="num text-[22px] font-semibold leading-none tracking-tight text-zinc-900">{value}</p>
      {/* label */}
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">{label}</p>
      {/* sub */}
      <p className="mt-2 border-t border-zinc-100 pt-2 text-[11px] text-zinc-400">{sub}</p>
    </div>
  )
}

// ── CSV export helper ─────────────────────────────────────────────────────────
function exportCSV(rows: object[], name = 'export.csv') {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => (r as Record<string, unknown>)[h] ?? '').join(',')),
  ].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function Page() {
  const [active, setActive]       = useState('Executive dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // data
  const { data: spendData, loading: spendLoading } = useSpendBreakdown()
  const { data: capData,   loading: capLoading   } = useCapacities()
  const { data: poData,    loading: poLoading    } = usePurchaseOrders()
  const { data: novaStatus, syncing, sync: syncNova } = useNovaStatus()
  const { data: optResult, loading: optLoading, run: runOpt } = useOptimization('cost_minimization')

  const summaryMetrics = optResult?.summary
  const orders = poData?.orders ?? []

  // derived chart data
  const pieData = spendData ?? [
    { name: 'Vinayaka Steel',  value: 32, color: '#3b82f6' },
    { name: 'Vishnu Systems',  value: 24, color: '#14b8a6' },
    { name: 'Indira Paper',    value: 19, color: '#8b5cf6' },
    { name: 'Other vendors',   value: 25, color: '#e4e4e7' },
  ]

  const capChart = capData?.capacities.map(c => ({
    name:      c.supplier_name.split(' ')[0],
    allocated: c.allocated_pct,
    available: c.available_pct,
  })) ?? []

  const timelineData = optResult?.delivery_timeline ?? [
    { week: 'W1' }, { week: 'W2' }, { week: 'W3' },
    { week: 'W4' }, { week: 'W5' }, { week: 'W6' },
  ]
  const timelineSuppliers = optResult?.spend_by_supplier?.map(
    (s: { name: string; color: string }) => ({ name: s.name, color: s.color })
  ) ?? []

  async function handleRunOpt() {
    await runOpt('cost_minimization')
    setActive('Optimization runs')
  }

  // ── sidebar ────────────────────────────────────────────────────────────────
  const sidebar = (
    <aside className={`
      fixed inset-y-0 left-0 z-40 flex w-60 flex-col
      bg-[oklch(0.105_0.008_255)] text-white
      border-r border-white/[0.06]
      transition-transform lg:translate-x-0
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      {/* logo */}
      <div className="flex h-14 items-center gap-3 border-b border-white/[0.06] px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-blue-600 shadow-sm shadow-blue-500/30">
          <Database className="size-3.5 text-white" />
        </div>
        <div>
          <p className="text-[13px] font-semibold tracking-tight text-white">NexusFlow</p>
          <p className="text-[10px] text-white/40 tracking-wide uppercase">Procurement OS</p>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">
          Workspace
        </p>
        {NAV.map(({ label, icon: Icon }) => {
          const isActive = active === label
          return (
            <button
              key={label}
              type="button"
              onClick={() => { setActive(label); setMobileOpen(false) }}
              className={`
                group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-all
                ${isActive
                  ? 'bg-white/[0.07] text-white font-medium border-l-2 border-blue-400 pl-[9px]'
                  : 'text-white/40 hover:bg-white/[0.04] hover:text-white/70 border-l-2 border-transparent pl-[9px]'}
              `}
            >
              <Icon className={`size-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-white/30 group-hover:text-white/50'}`} />
              <span className="flex-1 truncate">{label}</span>
              {label === 'Optimization runs' && (
                <span className={`text-[10px] font-semibold tabular-nums rounded px-1 py-0.5 ${
                  optResult
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-white/[0.06] text-white/25'
                }`}>
                  {optResult ? '1' : '0'}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* footer */}
      <div className="border-t border-white/[0.06] p-3 space-y-3">
        {/* Plan health */}
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className={`pulse-dot ${summaryMetrics ? 'pulse-dot--green' : 'pulse-dot--amber'}`} />
              <span className="text-[11px] font-medium text-white/60">Plan health</span>
            </div>
            {novaStatus && (
              <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                novaStatus.data_source === 'nova'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-amber-500/15 text-amber-400'
              }`}>
                {novaStatus.data_source === 'nova' ? '● live' : '⚠ offline'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/30 mb-2">
            {summaryMetrics
              ? `${summaryMetrics.demand_fulfillment_pct}% fulfillment · ${summaryMetrics.supplier_count_used} vendors`
              : 'Run optimization to compute health'}
          </p>
          <div className="h-1 rounded-full bg-white/[0.07] overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${summaryMetrics?.demand_fulfillment_pct ?? 0}%` }}
            />
          </div>
        </div>

        {/* User */}
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-500/80 text-[11px] font-semibold text-white">JS</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-white/70">Jordan Smith</p>
            <p className="truncate text-[10px] text-white/25">Operations lead</p>
          </div>
          <button className="text-white/20 hover:text-white/50 transition-colors">
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )

  // ── header ─────────────────────────────────────────────────────────────────
  const header = (
    <header className="
      sticky top-0 z-30 flex h-12 items-center justify-between
      border-b border-zinc-200/80 bg-white/90 px-5 backdrop-blur-sm
      lg:px-6
    ">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-7 lg:hidden text-zinc-400" onClick={() => setMobileOpen(true)}>
          <Menu className="size-4" />
        </Button>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="font-medium text-zinc-600">{active}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-7 text-zinc-400 hover:text-zinc-600">
          <Search className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="relative size-7 text-zinc-400 hover:text-zinc-600">
          <Bell className="size-3.5" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-blue-500" />
        </Button>
      </div>
    </header>
  )

  // ── dashboard ──────────────────────────────────────────────────────────────
  function DashboardView() {
    return (
      <div className="space-y-6">

        {/* Nova banner */}
        {novaStatus && (
          <div className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-xs ${
            novaStatus.data_source === 'nova'
              ? 'border-emerald-200/60 bg-emerald-50/60 text-emerald-700'
              : 'border-amber-200/60 bg-amber-50/60 text-amber-700'
          }`}>
            <div className="flex items-center gap-2">
              {novaStatus.data_source === 'nova'
                ? <CheckCircle2 className="size-3.5 shrink-0" />
                : <WifiOff className="size-3.5 shrink-0" />}
              <span className="font-medium">
                {novaStatus.data_source === 'nova' ? 'Live — Nova API' : 'Offline mode'}
              </span>
              <span className="text-current/60">
                · {novaStatus.suppliers} vendors · {novaStatus.skus} SKUs · {novaStatus.purchase_orders} POs
                {novaStatus.last_synced_at && ` · synced ${new Date(novaStatus.last_synced_at).toLocaleTimeString()}`}
              </span>
            </div>
            <button
              onClick={async () => { await syncNova(); window.location.reload() }}
              disabled={syncing}
              className="flex items-center gap-1 rounded border border-current/20 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`size-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          </div>
        )}

        {/* Page heading */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400">{todayLabel()}</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
              {greet()}, Jordan
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-zinc-200 text-xs text-zinc-600 hover:text-zinc-900"
              onClick={() => exportCSV(orders.map(o => ({
                po: o.po_number, supplier: o.supplier_name,
                value: o.order_value, delivery: o.expected_delivery, status: o.status,
              })), 'nexusflow_report.csv')}
            >
              <Download className="size-3.5" />Export
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700 active:scale-[0.98]"
              onClick={handleRunOpt}
              disabled={optLoading}
            >
              {optLoading ? <Spinner /> : <Plus className="size-3.5" />}
              New optimization
            </Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Projected spend"
            value={summaryMetrics ? `₹${(summaryMetrics.total_cost / 100000).toFixed(1)}L` : '—'}
            sub="Total cost of ownership"
            icon={Gauge}
            trend="up"
          />
          <KpiCard
            label="Fulfillment"
            value={summaryMetrics ? `${summaryMetrics.demand_fulfillment_pct}%` : '—'}
            sub="Demand coverage"
            icon={Package}
            trend="up"
          />
          <KpiCard
            label="Lead time"
            value={summaryMetrics ? `${summaryMetrics.weighted_lead_time_days}d` : '—'}
            sub="Weighted average"
            icon={Truck}
            trend="down"
          />
          <KpiCard
            label="Reliability"
            value="92.4%"
            sub="Across active vendors"
            icon={ShieldCheck}
            trend="up"
          />
          <KpiCard
            label="Open orders"
            value={poData ? String(poData.total) : '—'}
            sub={`₹${(poData?.total_value ?? 0).toLocaleString()} total`}
            icon={ClipboardList}
            trend="up"
          />
        </div>

        {/* Charts — asymmetric 3-col */}
        <div className="grid gap-4 xl:grid-cols-[2fr_1.2fr_1fr]">

          {/* Spend donut */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-zinc-800">Vendor spend</p>
                <p className="text-[11px] text-zinc-400">Q4 2026 allocation by vendor</p>
              </div>
              <button className="text-zinc-300 hover:text-zinc-500"><MoreHorizontal className="size-4" /></button>
            </div>
            <div className="flex items-center gap-5 p-4">
              {spendLoading ? (
                <div className="flex h-40 w-full items-center justify-center"><Spinner cls="size-5" /></div>
              ) : (
                <>
                  <div className="relative h-40 w-40 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name"
                          innerRadius={46} outerRadius={68} paddingAngle={2} strokeWidth={0}>
                          {pieData.map(e => <Cell key={e.name} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={v => `${v}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="num text-lg font-semibold text-zinc-900">
                        {summaryMetrics ? `₹${(summaryMetrics.total_cost / 100000).toFixed(1)}L` : '₹—'}
                      </p>
                      <p className="text-[10px] text-zinc-400">total</p>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    {pieData.map(item => (
                      <div key={item.name} className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="flex-1 truncate text-xs text-zinc-500">{item.name}</span>
                        <span className="num text-xs font-semibold text-zinc-700 tabular-nums">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Capacity bars */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="border-b border-zinc-100 px-4 py-3">
              <p className="text-[13px] font-semibold text-zinc-800">Capacity</p>
              <p className="text-[11px] text-zinc-400">Allocated vs. available</p>
            </div>
            <div className="px-4 py-3">
              {capLoading ? (
                <div className="flex h-36 items-center justify-center"><Spinner cls="size-5" /></div>
              ) : (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={capChart} layout="vertical" margin={{ left: 0, right: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#f4f4f5" />
                      <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`}
                        tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name"
                        tick={{ fontSize: 10, fill: '#71717a' }} axisLine={false} tickLine={false} width={52} />
                      <Tooltip formatter={v => `${v}%`} />
                      <Bar dataKey="allocated" stackId="a" fill="#3b82f6" radius={[3,0,0,3]} />
                      <Bar dataKey="available" stackId="a" fill="#f4f4f5" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="text-[13px] font-semibold text-zinc-800">Alerts</p>
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {3 - dismissed.size}
              </span>
            </div>
            <div className="divide-y divide-zinc-100">
              {[
                { key: 'capacity', icon: AlertTriangle, color: 'text-amber-500', title: 'Capacity threshold', body: 'Apex at 82% — week 42' },
                { key: 'leadtime', icon: Truck,         color: 'text-blue-500',   title: 'Lead-time variance', body: 'Vertex moved +3 days' },
                { key: 'source',   icon: CircleHelp,    color: 'text-violet-500', title: 'Single-source risk', body: 'SKU-441 — no alternate' },
              ].map(({ key, icon: Icon, color, title, body }) =>
                !dismissed.has(key) ? (
                  <div key={key} className="flex items-start gap-2.5 px-4 py-2.5">
                    <Icon className={`mt-0.5 size-3.5 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-zinc-700">{title}</p>
                      <p className="text-[11px] text-zinc-400">{body}</p>
                    </div>
                    <button onClick={() => setDismissed(prev => new Set([...prev, key]))}
                      className="mt-0.5 text-zinc-300 hover:text-zinc-500">
                      <X className="size-3" />
                    </button>
                  </div>
                ) : null
              )}
              {dismissed.size === 3 && (
                <p className="px-4 py-4 text-center text-xs text-zinc-400">All alerts cleared</p>
              )}
            </div>
          </div>
        </div>

        {/* Delivery timeline */}
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-zinc-800">Delivery timeline</p>
              <p className="text-[11px] text-zinc-400">Expected inbound shipments — 6-week horizon</p>
            </div>
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-500">
              Oct 01 — Nov 12
            </span>
          </div>
          <div className="px-4 pb-3 pt-3">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f4f4f5" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a1aa' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  {timelineSuppliers.map(s => (
                    <Line key={s.name} type="monotone" dataKey={s.name}
                      stroke={s.color} strokeWidth={2} dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                      connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {timelineSuppliers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-4">
                {timelineSuppliers.map(s => (
                  <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent POs */}
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-zinc-800">Recent purchase orders</p>
              <p className="text-[11px] text-zinc-400">Latest activity across your procurement network</p>
            </div>
            <button
              onClick={() => setActive('Purchase orders')}
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
            >
              View all <ArrowUpRight className="size-3" />
            </button>
          </div>
          {poLoading ? (
            <div className="flex h-32 items-center justify-center"><Spinner cls="size-5" /></div>
          ) : (
            <table className="table-editorial w-full">
              <thead>
                <tr>
                  <th className="pl-4">PO number</th>
                  <th>Supplier</th>
                  <th>SKUs</th>
                  <th className="text-right">Value</th>
                  <th>Delivery</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map(o => (
                  <tr key={o.po_number}>
                    <td className="pl-4">
                      <span className="font-mono text-[12px] font-medium text-blue-600">{o.po_number}</span>
                    </td>
                    <td className="font-medium text-zinc-700">{o.supplier_name.split(' ').slice(0, 2).join(' ')}</td>
                    <td className="text-zinc-400">{o.line_items.length}</td>
                    <td className="text-right">
                      <span className="num font-semibold text-zinc-800">₹{o.order_value.toLocaleString()}</span>
                    </td>
                    <td className="text-zinc-400">{o.expected_delivery}</td>
                    <td><StatusPill status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* CTA strip */}
        <div className="flex items-center justify-between rounded-lg border border-blue-200/60 bg-blue-50/50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-7 items-center justify-center rounded-md bg-blue-100 text-blue-600">
              <Sparkles className="size-3.5" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-zinc-800">Ready to reoptimize?</p>
              <p className="text-[11px] text-zinc-500">Run a fresh MILP solve with the latest Nova API data.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-blue-600 text-xs hover:bg-blue-700 active:scale-[0.98]"
            onClick={handleRunOpt}
            disabled={optLoading}
          >
            {optLoading ? <Spinner /> : <Zap className="size-3.5" />}
            Run solver
          </Button>
        </div>
      </div>
    )
  }

  // ── route ──────────────────────────────────────────────────────────────────
  function renderContent() {
    switch (active) {
      case 'Executive dashboard': return <DashboardView />
      case 'Demand planning':     return <DemandPlanningView />
      case 'Supplier management': return <SupplierCapacityView />
      case 'Pricing matrix':      return <PricingMatrixView />
      case 'Optimization runs':   return <OptimizationView />
      case 'Purchase orders':     return <ProcurementPlanView />
      case 'Scenario analysis':   return <ScenarioView />
      default:
        return (
          <div className="flex min-h-[480px] items-center justify-center">
            <div className="text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50">
                <Settings className="size-5 text-zinc-400" />
              </div>
              <p className="mt-3 text-[13px] font-medium text-zinc-700">{active}</p>
              <p className="mt-1 text-xs text-zinc-400">This section is coming soon.</p>
              <button
                onClick={() => setActive('Executive dashboard')}
                className="mt-4 text-xs font-medium text-blue-600 hover:underline"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-[oklch(0.975_0.002_240)]">
      {sidebar}

      {/* mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="lg:pl-60">
        {header}

        {/* blueprint grid background on page canvas */}
        <div className="grid-blueprint min-h-screen">
          <main className="mx-auto max-w-[1440px] p-5 lg:p-6">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  )
}
