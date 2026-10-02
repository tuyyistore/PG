import { useMemo, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, ProductThumb, EmptyState, StatusBadge, SkeletonRows } from '../ui'
import { useToast } from '../feedback'
import { Btn, Field, FIELD, FIELD_STYLE, Modal, MUTED, Pager, downloadCsv, fetchAllRows, ilikeOr, useDebounced, usePaged } from './adminKit'

const PAGE = 50
const STATUS_FILTERS = [['semua', 'Semua'], ['pending', 'Pending'], ['terlambat', 'Terlambat'], ['aktif', 'Aktif'], ['nonaktif', 'Nonaktif'], ['dibatalkan', 'Dibatalkan']] as const
type StatusFilter = (typeof STATUS_FILTERS)[number][0]

const orderCode = (o: Row) => String(o.order_code ?? `ORD-${o.id}`)

export function AdminOrders({ slaHours, lateCount, onChanged }: { slaHours: number; lateCount: number; onChanged: () => void }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const dq = useDebounced(search)
  const [status, setStatus] = useState<StatusFilter>('semua')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [orderNotes, setOrderNotes] = useState<Record<number, string>>({})
  const [actionErr, setActionErr] = useState('')
  const [exporting, setExporting] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<Row | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelRefund, setCancelRefund] = useState(true)
  const [cancelRestock, setCancelRestock] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelErr, setCancelErr] = useState('')

  // Batas "terlambat" dihitung sekali per ganti filter supaya query tidak berubah tiap render.
  const lateCutoff = useMemo(() => new Date(Date.now() - slaHours * 3600000).toISOString(), [slaHours, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => {
    let f = ''
    if (status === 'terlambat') f += `&status=eq.pending&created_at=lt.${encodeURIComponent(lateCutoff)}`
    else if (status !== 'semua') f += `&status=eq.${status}`
    if (dateFrom) f += `&created_at=gte.${encodeURIComponent(new Date(dateFrom + 'T00:00:00').toISOString())}`
    if (dateTo) f += `&created_at=lte.${encodeURIComponent(new Date(dateTo + 'T23:59:59').toISOString())}`
    f += ilikeOr(['order_code', 'product_name', 'buyer_email', 'buyer_code'], dq)
    return `admin_orders?select=*&order=id.desc${f}`
  }, [status, lateCutoff, dateFrom, dateTo, dq])

  const { rows, total, loading, err, offset, setOffset, reload } = usePaged(base, PAGE)
  const filtering = status !== 'semua' || Boolean(dateFrom || dateTo || dq.trim())

  const isLate = (o: Row) => slaHours > 0 && o.status === 'pending' && Date.now() - new Date(o.created_at).getTime() > slaHours * 3600000

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn(); reload(); onChanged(); setActionErr('')
      if (msg) toast(msg)
    } catch (e) { setActionErr((e as Error).message) }
  }

  const copyOrderId = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast('Kode order disalin: ' + code) }
    catch { toast('Gagal menyalin ID pesanan', 'error') }
  }

  const saveAccountData = (o: Row) => run(() => api(`orders?id=eq.${o.id}`, {
    method: 'PATCH',
    body: (() => { const data = orderNotes[o.id] ?? o.account_data ?? ''; return o.status === 'pending' && data.trim() ? { account_data: data, status: 'aktif' } : { account_data: data } })(),
  }), 'Data akun disimpan')

  const openCancel = (o: Row) => {
    setCancelTarget(o); setCancelReason(''); setCancelRefund(true)
    setCancelRestock(o.status === 'pending') // pending = belum ada data terkirim, aman dikembalikan ke stok
    setCancelErr('')
  }
  async function doCancel() {
    if (!cancelTarget) return
    const code = orderCode(cancelTarget)
    setCancelBusy(true); setCancelErr('')
    try {
      await api('rpc/cancel_order', { method: 'POST', body: { p_order_id: cancelTarget.id, p_reason: cancelReason.trim() || null, p_refund: cancelRefund, p_restock: cancelRestock } })
      setCancelTarget(null)
      reload(); onChanged()
      toast(`Pesanan ${code} dibatalkan`)
    } catch (e) { setCancelErr((e as Error).message) } finally { setCancelBusy(false) }
  }

  async function exportOrders() {
    setExporting(true); setActionErr('')
    try {
      const all = await fetchAllRows(base)
      downloadCsv(`pesanan-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Kode', 'Tanggal', 'Pembeli', 'Produk', 'Kategori', 'Harga', 'Status'],
        ...all.map(o => [orderCode(o), new Date(o.created_at).toLocaleString('id-ID'), o.buyer_email ?? o.user_id, o.product_name ?? '', o.category ?? '', o.price, o.status]),
      ])
    } catch (e) { setActionErr((e as Error).message) } finally { setExporting(false) }
  }

  return (
    <div className="space-y-4">
      {(err || actionErr) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || actionErr}</span></div>}
      {lateCount > 0 && (
        <div className="alert alert-warning">
          <Icon name="clock" size={16} className="mt-0.5 flex-shrink-0" />
          <span>{lateCount} pesanan pending sudah lebih dari {slaHours} jam. Segera proses atau batalkan &amp; refund.</span>
        </div>
      )}

      <div className="card p-4 sm:p-5 space-y-3">
        <Field label="Cari kode order (mis. ORD-K7M2QX9P), nama produk, atau email pembeli">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={MUTED}><Icon name="search" size={16} /></span>
            <input className="input" style={{ paddingLeft: 40 }} placeholder="mis. ORD-K7M2QX9P" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.filter(([id]) => id !== 'terlambat' || slaHours > 0).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatus(id)} className={`chip ${status === id ? 'chip-active' : ''}`}>{label}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dari tanggal"><input className={FIELD} type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></Field>
          <Field label="Sampai tanggal"><input className={FIELD} type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></Field>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="hint">{filtering ? (total > 0 ? `${total} pesanan cocok dengan filter.` : 'Tidak ada pesanan yang cocok.') : `${total} pesanan.`}</p>
          <Btn onClick={exportOrders} variant="secondary" disabled={exporting || total === 0}><Icon name="upload" size={14} /> {exporting ? 'Menyiapkan...' : 'Ekspor CSV'}</Btn>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="card overflow-hidden"><SkeletonRows rows={3} /></div>
      ) : rows.length === 0 ? (
        <div className="card"><EmptyState icon="clipboard" title={filtering ? 'Tidak ada pesanan yang cocok dengan filter.' : 'Belum ada pesanan.'} /></div>
      ) : (
        <div className={`grid grid-cols-1 xl:grid-cols-2 gap-3 items-start transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {rows.map(o => (
            <div key={o.id} className="card p-4 sm:p-5 space-y-4">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <ProductThumb url={o.logo_url} size={40} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{o.product_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.buyer_email ?? String(o.user_id).slice(0, 8)}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-white tabular whitespace-nowrap">{formatRp(o.price)}</p>
                  <div className="mt-1 flex items-center justify-end gap-1.5">{isLate(o) && <span className="badge badge-warning">Terlambat</span>}<StatusBadge status={o.status} /></div>
                </div>
              </div>
              <div className="flex items-center gap-2 card-inset pl-3.5 pr-1.5 py-1.5">
                <span className="text-[13px] font-medium text-white flex-1 truncate font-mono">{orderCode(o)}</span>
                <button onClick={() => copyOrderId(orderCode(o))} className="btn btn-ghost btn-sm" aria-label="Salin ID pesanan">
                  <Icon name="copy" size={14} /> Salin ID
                </button>
              </div>
              {(o.buyer_whatsapp || o.buyer_contact_email) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon name="mail" size={13} /> Kontak: {o.buyer_contact_email ?? '-'}{o.buyer_whatsapp ? ` · WA ${o.buyer_whatsapp}` : ''}</p>
              )}
              {o.status === 'dibatalkan' ? (
                <div className="alert alert-warning">
                  <Icon name="info" size={16} className="mt-0.5 flex-shrink-0" />
                  <p className="text-[13px]">
                    Dibatalkan{o.cancelled_at ? ` ${new Date(o.cancelled_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.
                    {' '}{Number(o.refunded_amount) > 0 ? `Refund ${formatRp(o.refunded_amount)}.` : 'Tanpa refund.'}
                    {o.cancel_reason ? ` Alasan: ${o.cancel_reason}` : ''}
                  </p>
                </div>
              ) : (<>
                <Field label="Status">
                  <select value={o.status} onChange={e => run(() => api(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: e.target.value } }))} className={FIELD} style={FIELD_STYLE}>
                    <option value="pending">Menunggu konfirmasi</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
                  </select>
                </Field>
                <Field label="Data akun / info penting (dikirim ke user)">
                  <textarea className="input" rows={2} placeholder="mis. IP: 1.2.3.4, user: root, pass: ****"
                    value={orderNotes[o.id] ?? o.account_data ?? ''} onChange={e => setOrderNotes(prev => ({ ...prev, [o.id]: e.target.value }))} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Btn onClick={() => openCancel(o)} variant="danger"><Icon name="x" size={14} /> Batalkan &amp; Refund</Btn>
                  <Btn onClick={() => saveAccountData(o)} variant="primary"><Icon name="check" size={14} /> Simpan Data Akun</Btn>
                </div>
              </>)}
            </div>
          ))}
        </div>
      )}

      <Pager offset={offset} limit={PAGE} total={total} onChange={setOffset} />

      {cancelTarget && (
        <Modal title={`Batalkan ${orderCode(cancelTarget)}`} onClose={() => { if (!cancelBusy) setCancelTarget(null) }}>
          <p className="text-[13px] text-slate-300">{cancelTarget.product_name} · {formatRp(cancelTarget.price)} · {cancelTarget.buyer_email ?? String(cancelTarget.user_id).slice(0, 8)}</p>
          {cancelErr && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{cancelErr}</span></div>}
          <Field label="Alasan (dikirim ke pembeli lewat notifikasi & WhatsApp)">
            <textarea className="input" rows={2} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="mis. Stok kosong dari supplier" />
          </Field>
          <label className="flex items-start gap-2 text-[13px] text-slate-200">
            <input type="checkbox" className="mt-0.5" checked={cancelRefund} onChange={e => setCancelRefund(e.target.checked)} />
            <span>Kembalikan {formatRp(cancelTarget.price)} ke saldo pembeli</span>
          </label>
          <label className="flex items-start gap-2 text-[13px] text-slate-200">
            <input type="checkbox" className="mt-0.5" checked={cancelRestock} onChange={e => setCancelRestock(e.target.checked)} />
            <span>Kembalikan stok produk. Untuk produk kirim otomatis, data akun masuk lagi ke daftar stok. Jangan dicentang kalau pembeli sudah memakainya.</span>
          </label>
          <p className="hint">Tindakan ini tidak bisa dibatalkan. Voucher yang dipakai ikut dikembalikan bila semua pesanan dari pembelian itu dibatalkan.</p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setCancelTarget(null)} variant="secondary" disabled={cancelBusy}>Tutup</Btn>
            <Btn onClick={doCancel} variant="danger" disabled={cancelBusy}>{cancelBusy ? 'Memproses...' : 'Batalkan pesanan'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
