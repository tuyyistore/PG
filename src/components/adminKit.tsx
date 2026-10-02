import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { apiPage, type Row } from '../lib/supabase'
import { Icon } from '../ui'
import { csvCell, ilikeOr } from '../lib/csv'

export const MUTED = { color: '#94a3b8' }
export const FIELD = 'input input-sm'
export const FIELD_STYLE = {} as CSSProperties

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="text-[12px] font-medium text-slate-300 mb-1.5 block">{label}</span>{children}</label>
}

export type BtnVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost'

// `color` dipertahankan untuk kompatibilitas; dipetakan ke varian tombol netral.
const COLOR_VARIANT: Record<string, BtnVariant> = {
  '#3d7ef5': 'primary', '#2657c9': 'secondary', '#15803d': 'success', '#b91c1c': 'danger', '#b45309': 'warning', '#4b5378': 'ghost',
}

export function Btn({ children, onClick, color = '#3d7ef5', variant, disabled }: { children: ReactNode; onClick: () => void; color?: string; variant?: BtnVariant; disabled?: boolean }) {
  const v = variant ?? COLOR_VARIANT[color] ?? 'primary'
  const cls = v === 'ghost' ? 'btn-secondary' : `btn-${v}`
  return (
    <button onClick={onClick} disabled={disabled} className={`btn btn-sm ${cls}`}>
      {children}
    </button>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-semibold text-white">{title}</p>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function downloadCsv(name: string, rows: unknown[][]) {
  const esc = (v: unknown) => `"${String(csvCell(v)).replace(/"/g, '""')}"`
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ─── Query PostgREST ─────────────────────────────────────────────────────────

export { ilikeOr }

/** Ambil semua baris (per 1000) untuk ekspor; `base` harus sudah punya select & order. */
export async function fetchAllRows(base: string, max = 20000): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; offset < max; offset += 1000) {
    const { rows, total } = await apiPage(`${base}&limit=1000&offset=${offset}`)
    out.push(...rows)
    if (rows.length < 1000 || out.length >= total) break
  }
  return out
}

/** Daftar berhalaman dari server. Ganti `path` (filter/pencarian) → otomatis kembali ke halaman 1. */
export function usePaged(path: string, limit = 50) {
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const lastPath = useRef(path)
  const reqId = useRef(0)

  useEffect(() => {
    if (lastPath.current !== path) {
      lastPath.current = path
      if (offset !== 0) { setOffset(0); return } // efek jalan lagi dengan offset 0
    }
    const id = ++reqId.current
    setLoading(true)
    apiPage(`${path}&limit=${limit}&offset=${offset}`)
      .then(r => { if (id === reqId.current) { setRows(r.rows); setTotal(r.total); setErr('') } })
      .catch(e => { if (id === reqId.current) setErr((e as Error).message) })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [path, offset, limit, tick])

  return { rows, total, loading, err, offset, setOffset, reload: () => setTick(t => t + 1) }
}

export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-xs text-muted-foreground tabular">{from}–{to} dari {total}</p>
      <div className="flex gap-2">
        <button className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Sebelumnya</button>
        <button className="btn btn-secondary btn-sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Berikutnya</button>
      </div>
    </div>
  )
}
