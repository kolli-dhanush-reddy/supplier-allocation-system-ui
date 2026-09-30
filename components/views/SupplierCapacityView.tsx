'use client'

import React, { useState } from 'react'
import { Edit2, MapPin, Plus, RefreshCw, ShieldCheck, Trash2, Truck } from 'lucide-react'
import { ErrorBanner, Spinner } from '@/components/ui/feedback'
import { useCapacities, useSuppliers, useSupplierMutations } from '@/src/lib/hooks'
import type { Supplier, SupplierUpsert } from '@/src/types/procurement'

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

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'pulse-dot pulse-dot--green',
    at_risk:  'pulse-dot pulse-dot--amber',
    inactive: 'pulse-dot',
  }
  return <span className={map[status] ?? 'pulse-dot'} title={status} />
}

// ── inline form ───────────────────────────────────────────────────────────────
function SupplierForm({ initial, onSave, onCancel }: {
  initial?: Supplier
  onSave: (d: SupplierUpsert) => void
  onCancel: () => void
}) {
  const [f, setF] = useState<SupplierUpsert>({
    name:                    initial?.name ?? '',
    status:                  initial?.status ?? 'active',
    reliability_score:       initial?.reliability_score ?? 80,
    lead_time_days:          initial?.lead_time_days ?? 7,
    weekly_capacity:         initial?.weekly_capacity ?? 1000,
    moq:                     initial?.moq ?? 0,
    max_order_qty:           initial?.max_order_qty ?? 0,
    location:                initial?.location ?? '',
    logistics_cost_per_unit: initial?.logistics_cost_per_unit ?? 0,
    payment_terms:           initial?.payment_terms ?? 'net_30',
    contact_email:           initial?.contact_email ?? '',
    notes:                   initial?.notes ?? '',
  })

  const inp = (k: keyof SupplierUpsert) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setF(prev => ({ ...prev, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }))

  const i = 'w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-zinc-400'
  const l = 'block mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-400'

  return (
    <div className="rounded-lg border border-blue-200/60 bg-blue-50/30 p-4">
      <p className="mb-3 text-[13px] font-semibold text-zinc-800">{initial ? `Edit — ${initial.name}` : 'Add supplier'}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div><label className={l}>Name *</label><input className={i} value={f.name} onChange={inp('name')} /></div>
        <div><label className={l}>Status</label>
          <select className={i} value={f.status} onChange={inp('status')}>
            <option value="active">Active</option>
            <option value="at_risk">At risk</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div><label className={l}>Reliability (0–100)</label><input type="number" className={i} min={0} max={100} value={f.reliability_score} onChange={inp('reliability_score')} /></div>
        <div><label className={l}>Lead time (days)</label><input type="number" className={i} min={0} value={f.lead_time_days} onChange={inp('lead_time_days')} /></div>
        <div><label className={l}>Weekly capacity</label><input type="number" className={i} min={0} value={f.weekly_capacity} onChange={inp('weekly_capacity')} /></div>
        <div><label className={l}>MOQ</label><input type="number" className={i} min={0} value={f.moq} onChange={inp('moq')} /></div>
        <div><label className={l}>Max order qty</label><input type="number" className={i} min={0} value={f.max_order_qty} onChange={inp('max_order_qty')} /></div>
        <div><label className={l}>Logistics ₹/unit</label><input type="number" className={i} min={0} step={0.01} value={f.logistics_cost_per_unit} onChange={inp('logistics_cost_per_unit')} /></div>
        <div><label className={l}>Payment terms</label>
          <select className={i} value={f.payment_terms} onChange={inp('payment_terms')}>
            <option value="net_30">Net 30</option>
            <option value="net_60">Net 60</option>
            <option value="net_90">Net 90</option>
            <option value="prepaid">Prepaid</option>
            <option value="cod">COD</option>
          </select>
        </div>
        <div><label className={l}>Location</label><input className={i} value={f.location} onChange={inp('location')} /></div>
        <div><label className={l}>Contact email</label><input type="email" className={i} value={f.contact_email} onChange={inp('contact_email')} /></div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => onSave(f)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:scale-[0.97] transition-all">Save</button>
        <button onClick={onCancel} className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50">Cancel</button>
      </div>
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function SupplierCapacityView() {
  const { data: supData, loading, error, refetch } = useSuppliers()
  const { data: capData } = useCapacities()
  const { loading: mutLoading, error: mutErr, createSupplier, updateSupplier, deleteSupplier } = useSupplierMutations()

  const [showCreate, setShowCreate]       = useState(false)
  const [editId, setEditId]               = useState<string | null>(null)
  const [confirmDel, setConfirmDel]       = useState<string | null>(null)

  const suppliers = supData?.suppliers ?? []
  const capMap    = Object.fromEntries((capData?.capacities ?? []).map(c => [c.supplier_id, c]))

  async function handleCreate(d: SupplierUpsert) {
    const r = await createSupplier(d); if (r) { setShowCreate(false); refetch() }
  }
  async function handleUpdate(id: string, d: SupplierUpsert) {
    const r = await updateSupplier(id, d); if (r) { setEditId(null); refetch() }
  }
  async function handleDelete(id: string) {
    const ok = await deleteSupplier(id); if (ok) { setConfirmDel(null); refetch() }
  }

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">Supplier Management</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">Vendor Directory</h2>
          <p className="mt-0.5 text-xs text-zinc-400">{supData?.total ?? 0} suppliers · capacity, lead times, order constraints</p>
        </div>
        <button onClick={() => setShowCreate(v => !v)}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:scale-[0.97] transition-all">
          <Plus className="size-3.5" />Add supplier
        </button>
      </div>

      {(error || mutErr) && <ErrorBanner message={(error ?? mutErr)!.detail} />}
      {showCreate && <SupplierForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />}

      {/* capacity bars */}
      <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <SH title="Capacity utilization" sub="Weekly units allocated vs. available — derived from open POs" />
        <div className="space-y-2.5 px-4 py-3">
          {(capData?.capacities ?? []).map(c => (
            <div key={c.supplier_id}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700">{c.supplier_name}</span>
                <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                  <span className={`font-semibold ${c.allocated_pct > 85 ? 'text-rose-600' : c.allocated_pct > 65 ? 'text-amber-600' : 'text-blue-600'}`}>
                    {c.allocated_pct}%
                  </span>
                  <span className="num">{c.allocated_units.toLocaleString()} / {c.weekly_capacity.toLocaleString()}</span>
                </div>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div className={`h-full rounded-full transition-all ${c.allocated_pct > 85 ? 'bg-rose-500' : c.allocated_pct > 65 ? 'bg-amber-500' : 'bg-blue-500'}`}
                  style={{ width: `${c.allocated_pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* supplier table */}
      {loading ? <div className="flex h-40 items-center justify-center"><Spinner cls="size-5" /></div> : (
        <div className="rounded-lg border border-zinc-200/80 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden">
          <SH title="Supplier directory" />
          <div className="overflow-x-auto">
            <table className="table-editorial w-full">
              <thead>
                <tr>
                  <th className="pl-4">Supplier</th>
                  <th>Status</th>
                  <th>Reliability</th>
                  <th>Lead time</th>
                  <th>Capacity / wk</th>
                  <th>MOQ / Max</th>
                  <th>Terms</th>
                  <th>Location</th>
                  <th className="pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map(sup => (
                  <React.Fragment key={sup.id}>
                    <tr>
                      <td className="pl-4">
                        <p className="text-xs font-semibold text-zinc-800">{sup.name}</p>
                        <p className="font-mono text-[10px] text-zinc-400">{sup.id}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusDot status={sup.status} />
                          <span className="text-xs text-zinc-500 capitalize">{sup.status.replace('_',' ')}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className={`size-3 ${sup.reliability_score >= 85 ? 'text-emerald-500' : sup.reliability_score >= 70 ? 'text-amber-500' : 'text-rose-500'}`} />
                          <span className="num text-xs font-semibold text-zinc-700">{sup.reliability_score}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Truck className="size-3 text-zinc-300" />
                          <span className="num text-xs text-zinc-600">{sup.lead_time_days}d</span>
                        </div>
                      </td>
                      <td><span className="num text-xs font-semibold text-zinc-700">{sup.weekly_capacity.toLocaleString()}</span></td>
                      <td><span className="num text-xs text-zinc-500">{sup.moq} / {sup.max_order_qty || '∞'}</span></td>
                      <td><span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{sup.payment_terms?.replace('_',' ')}</span></td>
                      <td>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                          <MapPin className="size-2.5" />{sup.location?.split(',')[0] ?? '—'}
                        </div>
                      </td>
                      <td className="pr-4">
                        <div className="flex gap-1">
                          <button onClick={() => setEditId(editId === sup.id ? null : sup.id)}
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-blue-600 transition-colors">
                            <Edit2 className="size-3" />
                          </button>
                          <button onClick={() => setConfirmDel(sup.id)}
                            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 transition-colors">
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editId === sup.id && (
                      <tr><td colSpan={9} className="bg-zinc-50/60 p-4">
                        <SupplierForm initial={sup} onSave={d => handleUpdate(sup.id, d)} onCancel={() => setEditId(null)} />
                      </td></tr>
                    )}
                    {confirmDel === sup.id && (
                      <tr><td colSpan={9} className="bg-rose-50/40 px-4 py-3">
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-medium text-rose-700">Delete <strong>{sup.name}</strong>? This is irreversible.</span>
                          <button onClick={() => handleDelete(sup.id)} disabled={mutLoading}
                            className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                            {mutLoading ? <RefreshCw className="size-3 animate-spin" /> : 'Confirm delete'}
                          </button>
                          <button onClick={() => setConfirmDel(null)} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">Cancel</button>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
