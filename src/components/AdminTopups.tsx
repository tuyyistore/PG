import { useMemo, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, EmptyState, StatusBadge, SkeletonRows } from '../ui'
import { useConfirm, useToast } from '../feedback'
import { Btn, Field, MUTED, Pager, ilikeOr, useDebounced, usePaged } from './adminKit'

const PAGE = 50
const STATUS_FILTERS = [['semua', 'Semua'], ['pending', 'Pending'], ['expired', 'Kedaluwarsa'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['cancelled', 'Dibatalkan']] as const
type StatusFilter = (typeof STATUS_FILTERS)[number][0]

export function AdminTopups({ onChanged }: { onChanged: () => void }) {
  const toast = useToast()
  const ask = useConfirm()
  const [search, setSearch] = useState('')
  const dq = useDebounced(search)
  const [status, setStatus] = useState<StatusFilter>('pending')
  const [actionErr, setActionErr] = useState('')

  const base = useMemo(
    () => `admin_topups?select=*&order=id.desc${status === 'semua' ? '' : `&status=eq.${status}`}${ilikeOr(['user_email', 'user_code'], dq)}`,
    [status, dq],
  )
  const { rows, total, loading, err, offset, setOffset, reload } = usePaged(base, PAGE)

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); reload(); onChanged(); setActionErr(''); toast(msg) }
    catch (e) { setActionErr((e as Error).message) }
  }

  const approve = async (t: Row) => {
    const transfer = Number(t.amount) + Number(t.unique_code ?? 0)
    const ok = await ask({
      title: `Setujui top up ${formatRp(t.amount)}?`,
      description: `${t.user_email ?? 'Pengguna'} akan menerima saldo ${formatRp(t.amount)}. Pastikan transfer ${formatRp(transfer)} sudah masuk.`,
      confirmLabel: 'Setujui',
    })
    if (ok) run(() => api('rpc/approve_topup', { method: 'POST', body: { tid: t.id } }), 'Top up disetujui')
  }

  return (
    <div className="space-y-4">
      {(err || actionErr) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || actionErr}</span></div>}
      <div className="card p-4 sm:p-5 space-y-3">
        <Field label="Cari email atau ID pengguna">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={MUTED}><Icon name="search" size={16} /></span>
            <input className="input" style={{ paddingLeft: 40 }} placeholder="mis. nama@gmail.com" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatus(id)} className={`chip ${status === id ? 'chip-active' : ''}`}>{label}</button>
          ))}
        </div>
        <p className="hint">{total} permintaan. Permintaan kedaluwarsa masih bisa disetujui kalau transfernya telat masuk.</p>
      </div>

      <div className={`card overflow-hidden transition-opacity ${loading && rows.length > 0 ? 'opacity-60' : ''}`}>
        {loading && rows.length === 0 ? <SkeletonRows rows={3} /> : rows.length === 0 ? (
          <EmptyState icon="wallet" title="Tidak ada permintaan top up." />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {rows.map(t => (
              <div key={t.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="wallet" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white tabular">{formatRp(t.amount)}
                    {t.unique_code ? <span className="text-xs font-normal text-muted-foreground"> · transfer {formatRp(Number(t.amount) + Number(t.unique_code))}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t.user_email ?? String(t.user_id).slice(0, 8)} · {new Date(t.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <StatusBadge status={t.status} />
                {(t.status === 'pending' || t.status === 'expired') && (
                  <div className="flex gap-1.5 ml-auto">
                    <Btn onClick={() => approve(t)} variant="success"><Icon name="check" size={14} strokeWidth={2.5} /> Setujui</Btn>
                    {t.status === 'pending' && (
                      <Btn onClick={() => run(() => api(`topups?id=eq.${t.id}`, { method: 'PATCH', body: { status: 'rejected' } }), 'Top up ditolak')} variant="danger"><Icon name="x" size={14} /></Btn>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Pager offset={offset} limit={PAGE} total={total} onChange={setOffset} />
    </div>
  )
}
