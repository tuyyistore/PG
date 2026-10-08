import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api, apiFn } from '../lib/supabase'
import { pollDelay } from '../lib/polling'
import { OtherPayMethods } from '../components/OtherPayMethods'
import { Icon, formatRp, PageHeader, EmptyState, StatusBadge, SkeletonRows } from '../ui'
import { useToast } from '../feedback'

const PRESETS = [10000, 25000, 50000, 100000]

function QrBox({ value }: { value: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: 300, margin: 2, errorCorrectionLevel: 'M' }).then(u => { if (alive) setSrc(u) }).catch(() => { if (alive) setSrc('') })
    return () => { alive = false }
  }, [value])
  if (!src) return <div className="skeleton mx-auto" style={{ width: 220, height: 220, borderRadius: 12 }} />
  return <div className="flex justify-center"><img src={src} alt="QRIS" width={220} height={220} className="rounded-lg bg-white p-2" /></div>
}

/** Kolom yang di-select di loadHistory (PostgREST mengirim bigint sebagai number). */
type TopupRow = {
  id: number
  amount: number
  status: string
  created_at: string
  gateway: string | null
  qris_string: string | null
  total_amount: number | null
  expired_at: string | null
}

export function SaldoPage({ saldo, userId, onPaid }: { saldo: number; userId: string; onPaid?: () => void }) {
  const [history, setHistory] = useState<TopupRow[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [amount, setAmount] = useState('')
  const [gwCreating, setGwCreating] = useState(false)
  const [gwBusyId, setGwBusyId] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const toast = useToast()

  const loadHistory = () => api<TopupRow[]>(`topups?select=id,amount,status,created_at,gateway,qris_string,total_amount,expired_at&user_id=eq.${userId}&order=id.desc&limit=10`).then(setHistory).catch(() => setHistory([]))
  const refreshHistory = async () => {
    if (refreshing) return
    setRefreshing(true)
    await Promise.all([loadHistory(), new Promise(r => setTimeout(r, 700))])
    setRefreshing(false)
  }
  useEffect(() => { loadHistory() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const nominal = Number(amount.replace(/\D/g, ''))

  // ── Top up otomatis via Betabotz Paygate (QRIS). Webhook = jalur utama, polling status = cadangan. ──
  const gwPending = (history ?? []).filter(t => t.status === 'pending' && t.gateway === 'betabotz')

  async function createGateway() {
    setGwCreating(true); setErr('')
    try {
      await apiFn('btz-create-topup', { method: 'POST', body: { amount: nominal } })
      setAmount('')
      toast('Pembayaran QRIS dibuat. Scan QR, saldo masuk otomatis setelah dibayar.')
      await loadHistory()
    } catch (e) { setErr((e as Error).message) } finally { setGwCreating(false) }
  }

  async function checkGateway(id: number, silent = false) {
    if (!silent) setGwBusyId(id)
    try {
      const r = await apiFn<{ status: string }>(`btz-status?id=${id}`)
      if (r.status !== 'pending') {
        if (r.status === 'approved') toast('Pembayaran diterima, saldo sudah masuk.')
        await loadHistory(); onPaid?.()
      } else if (!silent) toast('Pembayaran belum terdeteksi. Coba lagi sebentar setelah membayar.')
    } catch (e) { if (!silent) setErr((e as Error).message) } finally { if (!silent) setGwBusyId(null) }
  }

  async function cancelGateway(id: number) {
    setGwBusyId(id)
    try {
      await apiFn('btz-cancel', { method: 'POST', body: { id } })
      toast('Pembayaran dibatalkan')
      await loadHistory(); onPaid?.()
    } catch (e) { setErr((e as Error).message) } finally { setGwBusyId(null) }
  }

  // Polling cadangan dengan backoff (5 → 30 dtk). Tab disembunyikan = lewati; kembali ke tab = langsung cek & mulai cepat lagi.
  const gwKey = gwPending.map(t => t.id).join(',')
  useEffect(() => {
    if (!gwKey) return
    const ids = gwKey.split(',').map(Number)
    let timer: ReturnType<typeof setTimeout>
    let attempt = 0
    const tick = () => {
      if (!document.hidden) ids.forEach(id => checkGateway(id, true))
      timer = setTimeout(tick, pollDelay(++attempt))
    }
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); attempt = 0; tick() } }
    timer = setTimeout(tick, pollDelay(0))
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [gwKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageHeader title="Saldo" subtitle="Saldo dan riwayat top up akunmu." />

      <div className="card p-5 sm:p-6 space-y-4">
        <div className="card-inset p-4">
          <p className="text-xs text-muted-foreground">Saldo kamu</p>
          <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(saldo)}</p>
        </div>

        <div>
          <span className="label">Nominal top up</span>
          <input className="input" inputMode="numeric" value={amount ? nominal.toLocaleString('id-ID') : ''} onChange={e => setAmount(e.target.value)} placeholder="mis. 50.000" />
          <div className="flex gap-2 flex-wrap mt-2">
            {PRESETS.map(v => <button key={v} type="button" onClick={() => setAmount(String(v))} className="chip">{formatRp(v)}</button>)}
          </div>
        </div>
        {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{err}</span></div>}
        <button type="button" onClick={createGateway} disabled={gwCreating || nominal < 1000} className="btn btn-primary btn-lg btn-block">
          {gwCreating ? 'Membuat QRIS...' : <><Icon name="card" size={18} /> Bayar via QRIS</>}
        </button>
        <p className="hint">Scan QRIS lalu bayar sesuai nominal yang tampil. Saldo masuk otomatis setelah pembayaran terdeteksi.</p>
      </div>

      {gwPending.length > 0 && (
        <div className="space-y-3">
          {gwPending.map(t => {
            const total = Number(t.total_amount) || Number(t.amount)
            const busy = gwBusyId === t.id
            return (
              <div key={t.id} className="card p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="section-title">Menunggu pembayaran QRIS</h2>
                  <StatusBadge status={t.status} />
                </div>
                <div className="card-inset p-4">
                  <p className="text-xs text-muted-foreground">Bayar tepat sebesar</p>
                  <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Saldo yang masuk: {formatRp(t.amount)}</p>
                  {t.expired_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Berlaku sampai {new Date(t.expired_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                {t.qris_string
                  ? <QrBox value={t.qris_string} />
                  : <p className="text-xs text-muted-foreground text-center">QR belum tersedia. Batalkan pembayaran ini lalu buat yang baru.</p>}
                <button type="button" onClick={() => checkGateway(t.id)} disabled={busy} className="btn btn-primary btn-block">
                  {busy ? 'Memeriksa...' : 'Saya sudah bayar — cek status'}
                </button>
                <button type="button" onClick={() => cancelGateway(t.id)} disabled={busy} className="btn btn-ghost btn-block">Batalkan pembayaran ini</button>
              </div>
            )
          })}
        </div>
      )}

      <OtherPayMethods />

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Riwayat top up</h2>
            <p className="text-xs text-muted-foreground mt-0.5">10 transaksi terakhir</p>
          </div>
          <button onClick={refreshHistory} disabled={refreshing} aria-busy={refreshing} className="btn btn-ghost btn-icon btn-sm -mr-2" aria-label="Muat ulang riwayat">
            <span className={`inline-flex ${refreshing ? 'animate-spin' : ''}`}><Icon name="refresh" size={16} /></span>
          </button>
        </div>
        {history === null ? <SkeletonRows rows={2} thumb={36} /> : history.length === 0 ? (
          <EmptyState icon="wallet" title="Belum ada top up" description="Top up yang berhasil akan tercatat di sini." />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {history.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="wallet" size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white tabular">+ {formatRp(t.amount)}</p>
                  <p className="text-xs text-muted-foreground tabular">
                    {new Date(t.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
