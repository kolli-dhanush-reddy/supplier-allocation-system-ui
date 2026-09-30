/**
 * Shared feedback components — used across all views.
 * Centralised here to avoid duplication across 7 view files.
 */
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react'

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ className, cls }: { className?: string; cls?: string }) {
  return <Loader2 className={`animate-spin text-zinc-400 ${cls ?? className ?? 'size-4'}`} />
}

// ── Error banner ──────────────────────────────────────────────────────────────
type AnyError = string | { msg?: string; message?: string } | unknown

function stringify(msg: AnyError): string {
  if (typeof msg === 'string') return msg
  if (Array.isArray(msg))
    return (msg as { msg?: string; message?: string }[])
      .map(e => e.msg ?? e.message ?? JSON.stringify(e))
      .join(' · ')
  if (msg && typeof msg === 'object' && 'detail' in (msg as object))
    return stringify((msg as { detail: AnyError }).detail)
  return JSON.stringify(msg)
}

export function ErrorBanner({ message }: { message: AnyError }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{stringify(message)}</span>
    </div>
  )
}

// ── Success banner ────────────────────────────────────────────────────────────
export function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ── Info banner ───────────────────────────────────────────────────────────────
export function InfoBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ── Warning banner ────────────────────────────────────────────────────────────
export function WarningBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function EmptyState({
  title,
  subtitle,
  icon: Icon = Info,
}: {
  title: string
  subtitle?: string
  icon?: typeof Info
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="size-6" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  )
}
