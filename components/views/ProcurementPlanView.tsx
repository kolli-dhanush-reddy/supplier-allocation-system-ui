'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Download, RefreshCw, Truck } from 'lucide-react'
import { ErrorBanner, Spinner } from '@/components/ui/feedback'
import { usePurchaseOrders } from '@/src/lib/hooks'
import { api } from '@/src/lib/api'
import type { POStatus, PurchaseOrder } from '@/src/types/procurement'

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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status] ?? 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
      {status}
    </span>
  )
}

function exportCSV(orders: PurchaseOrder[]) {
  const rows = orders.flatMap(po =>
    po.line_items.map(li => ({
      po: po.po_number, supplier: po.supplier_name,
      sku: li.sku_id, item: li.sku_name,
      qty: li.quantity, unit: li.unit_price, total: li.line_total,
      delivery: po.expected_delivery, status: po.status,
    }))
  )
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map(r => h.map(k => (r as Record<string,unknown>)[k] ?? '').join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  Object.assign(document.createElement('a'), { href: url, download: 'purchase_orders.csv' }).click()
  URL.revokeObjectURL(url)
}

export default function ProcurementPlanView() {
  const { data, loading, error, refetch } = usePurchaseOrders()
  const [expanded, setExpanded]           = useState<Set<string>>(new Set())
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  const orders = data?.orders ?? []

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function updateStatus(po: PurchaseOrder, s: POStatus) {
    setStatusLoading(po.po_number)
    try { await api.purchaseOrders.updateStatus(po.po_number, s); refetch() }
    finally { setStatusLoading(null) }
  }

  const bySupplier = orders.reduce<Record<string, PurchaseOrder[]>>((acc, po) => {
    acc[po.supplier_name] = [...(acc[po.supplier_name] ?? []), po]; return acc
  }, {})

  const STATUS_LIST = ['Draft','Confirmed','In transit','At risk','Delivered','Cancelled'] as const

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Procurement Plan</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">Purchase Orders</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            {data?.total ?? 0} orders · ₹{(data?.total_value ?? 0).toLocaleString()} total value
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportCSV(orders)}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
            <Download className="size-3" />Export
          </button>
          <button onClick={refetch}
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
            <RefreshCw className="size-3" />Refresh
          </button>
        </div>
      </div>

      {loading && <div className="flex h-40 items-center justify-center"><Spinner cls="size-5" /></div>}
      {error   && <ErrorBanner message={error.detail} />}

      {!loading && !error && (
        <>
          {/* status chips */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_LIST.map(st => {
              const cnt = orders.filter(o => o.status === st).length
              if (!cnt) return null
              const map: Record<string, string> = {
                Draft: 'bg-zinc-100 text-zinc-500 border-zinc-200',
                Confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                'In transit': 'bg-blue-100 text-blue-700 border-blue-200',
                'At risk': 'bg-amber-100 text-amber-700 border-amber-200',
                Delivered: 'bg-teal-100 text-teal-700 border-teal-200',
                Cancelled: 'bg-rose-100 text-rose-600 border-rose-200',
              }
              return (
                <span key={st} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[st]}`}>
                  {st}
                  <span className="rounded-full bg-white/60 px-1 py-px text-[9px] font-bold tabular-nums">{cnt}</span>
                </span>
              )
            })}
          </div>

          {/* PO table */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
            <SH title="Orders" sub="Click row to expand line items · update status inline" />
            <div className="overflow-x-auto">
              <table className="table-editorial w-full">
                <thead>
                  <tr>
                    <th className="pl-3 w-8" />
                    <th className="pl-1">PO number</th>
                    <th>Supplier</th>
                    <th className="text-center">SKUs</th>
                    <th className="text-right">Value</th>
                    <th>Delivery</th>
                    <th>Status</th>
                    <th className="pr-4">Change status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(po => (
                    <React.Fragment key={po.po_number}>
                      <tr className="cursor-pointer" onClick={() => toggle(po.po_number)}>
                        <td className="pl-3 text-zinc-300">
                          {expanded.has(po.po_number) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        </td>
                        <td className="pl-1">
                          <span className="font-mono text-[12px] font-semibold text-blue-600">{po.po_number}</span>
                        </td>
                        <td className="max-w-[140px] truncate text-xs font-medium text-zinc-700">{po.supplier_name.split(' ').slice(0,2).join(' ')}</td>
                        <td className="text-center"><span className="num text-xs text-zinc-500">{po.line_items.length}</span></td>
                        <td className="text-right"><span className="num text-xs font-semibold text-zinc-800">₹{po.order_value.toLocaleString()}</span></td>
                        <td>
                          <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                            <Truck className="size-3 shrink-0" />{po.expected_delivery}
                          </div>
                        </td>
                        <td onClick={e => e.stopPropagation()}><StatusPill status={po.status} /></td>
                        <td className="pr-4" onClick={e => e.stopPropagation()}>
                          <select
                            value={po.status}
                            onChange={e => updateStatus(po, e.target.value as POStatus)}
                            disabled={statusLoading === po.po_number}
                            className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40"
                          >
                            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                      {expanded.has(po.po_number) && (
                        <tr>
                          <td colSpan={8} className="bg-zinc-50/70 px-5 py-3">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Line Items</p>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400">
                                  <th className="pb-1 text-left">SKU ID</th>
                                  <th className="pb-1 text-left">Description</th>
                                  <th className="pb-1 text-right">Qty</th>
                                  <th className="pb-1 text-right">Unit price</th>
                                  <th className="pb-1 text-right">Line total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {po.line_items.map(li => (
                                  <tr key={li.sku_id} className="border-t border-zinc-100">
                                    <td className="py-1 font-mono text-[11px] font-medium text-blue-600">{li.sku_id}</td>
                                    <td className="py-1 text-zinc-600">{li.sku_name}</td>
                                    <td className="py-1 text-right"><span className="num font-semibold text-zinc-700">{li.quantity.toLocaleString()}</span></td>
                                    <td className="py-1 text-right"><span className="num text-zinc-400">₹{li.unit_price.toFixed(2)}</span></td>
                                    <td className="py-1 text-right"><span className="num font-semibold text-zinc-800">₹{li.line_total.toLocaleString()}</span></td>
                                  </tr>
                                ))}
                                <tr className="border-t-2 border-zinc-200">
                                  <td colSpan={4} className="pt-1.5 text-xs font-semibold text-zinc-600">Order total</td>
                                  <td className="pt-1.5 text-right"><span className="num text-sm font-bold text-zinc-900">₹{po.order_value.toLocaleString()}</span></td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* delivery schedule */}
          <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <SH title="Delivery schedule" sub="Expected inbound grouped by vendor" />
            <div className="space-y-4 p-4">
              {Object.entries(bySupplier).map(([sup, pos]) => (
                <div key={sup}>
                  <p className="mb-2 text-xs font-semibold text-zinc-600">{sup}</p>
                  <div className="flex flex-wrap gap-2">
                    {pos.map(po => {
                      const colors: Record<string, string> = {
                        'At risk':    'border-amber-200 bg-amber-50',
                        'In transit': 'border-blue-200 bg-blue-50',
                        Confirmed:    'border-emerald-200 bg-emerald-50',
                        Draft:        'border-zinc-200 bg-zinc-50',
                        Delivered:    'border-teal-200 bg-teal-50',
                      }
                      return (
                        <div key={po.po_number} className={`rounded-md border px-3 py-2 ${colors[po.status] ?? 'border-zinc-200 bg-zinc-50'}`}>
                          <p className="font-mono text-[11px] font-semibold text-zinc-700">{po.po_number}</p>
                          <p className="num mt-0.5 text-[11px] text-zinc-500">{po.line_items.length} SKUs · ₹{po.order_value.toLocaleString()}</p>
                          <p className="mt-0.5 text-[10px] text-zinc-400">Due {po.expected_delivery}</p>
                          <div className="mt-1"><StatusPill status={po.status} /></div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
