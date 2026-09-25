import logoQris from '../assets/payments/qris.svg'
import { useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, PageHeader, EmptyState, StatusBadge, SkeletonRows } from '../ui'
import { QRISModal } from '../components/QRISModal'
import { PaymentMethodsCard } from '../components/PaymentMethods'

// ─── Saldo Page ───────────────────────────────────────────────────────────────

export function SaldoPage({ saldo, onPaid, userId }: { saldo: number; onPaid: () => void; userId: string }) {
  const [history, setHistory] = useState<Row[] | null>(null)
  const loadHistory = () => api(`topups?select=id,amount,status,created_at&user_id=eq.${userId}&order=id.desc&limit=10`).then(setHistory).catch(() => setHistory([]))
  useEffect(() => { loadHistory() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [nominal, setNominal] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [payment, setPayment] = useState<{ id: number; amount: number; expiresAt?: number } | null>(null)
  const presets = [10000, 25000, 50000, 100000, 250000, 500000]
  const finalNominal = nominal ?? Number(custom.replace(/\D/g, ''))

  const [creating, setCreating] = useState(false)
  const [payErr, setPayErr] = useState('')

  // Nominal unik (kode 1–99) dibuat & divalidasi di server lewat RPC `create_topup_payment`
  // (lihat supabase/migration_v4.sql) — klien hanya mengirim nominal dasar.
  async function startPayment() {
    if (finalNominal <= 0 || creating) return
    setCreating(true); setPayErr('')
    try {
      const row = await api<Row>('rpc/create_topup_payment', { method: 'POST', body: { base_amount: finalNominal } })
      setPayment({ id: Number(row.id), amount: Number(row.amount), expiresAt: row.created_at ? new Date(row.created_at).getTime() + 60 * 60 * 1000 : undefined })
    } catch (e) { setPayErr((e as Error).message || 'Gagal membuat pembayaran. Coba lagi.') } finally { setCreating(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Top Up Saldo" subtitle="Isi saldo instan lewat QRIS — terverifikasi otomatis." />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-6 items-start">
        {/* Left column */}
        <div className="space-y-4">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Pilih nominal</h2>
              <span className="text-xs text-muted-foreground">Langkah 1 dari 2</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {presets.map(n => (
                <button key={n} onClick={() => { setNominal(n); setCustom('') }}
                  className={`option h-14 px-4 flex items-center justify-between text-left ${nominal === n ? 'option-active' : ''}`}>
                  <span className="text-[15px] font-semibold tabular">{formatRp(n)}</span>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors duration-200 ${nominal === n ? 'bg-[#4f7cff]' : ''}`} style={nominal === n ? undefined : { border: '1.5px solid #3a4760' }}>
                    {nominal === n && <Icon name="check" size={10} strokeWidth={3} className="text-white" />}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <label className="label" htmlFor="custom-nominal">Nominal lainnya</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">Rp</span>
                <input id="custom-nominal" value={custom} onChange={e => { setCustom(e.target.value); setNominal(null) }}
                  placeholder="0" inputMode="numeric"
                  className="input tabular" style={{ paddingLeft: 44 }} />
              </div>
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Metode pembayaran</h2>
              <span className="text-xs text-muted-foreground">Langkah 2 dari 2</span>
            </div>
            <div className="option option-active px-4 py-3.5 flex items-center gap-4">
              <div className="w-12 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 px-1.5">
                <img src={logoQris} alt="QRIS" className="max-h-4 max-w-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">QRIS</p>
                <p className="text-xs text-muted-foreground truncate">E-wallet &amp; semua m-banking</p>
              </div>
              <span className="badge badge-primary">Otomatis</span>
            </div>
            <PaymentMethodsCard />
          </div>
        </div>

        {/* Right column — summary */}
        <div className="card p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="section-title mb-4">Ringkasan</h2>
          <div className="card-inset p-4 mb-4">
            <p className="text-xs text-muted-foreground">Saldo kamu</p>
            <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(saldo)}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Nominal top up</dt><dd className="text-white tabular">{finalNominal > 0 ? formatRp(finalNominal) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Metode</dt><dd className="text-white">QRIS</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Biaya layanan</dt><dd className="text-white">Gratis</dd></div>
          </dl>
          <div className="divider my-4" />
          <div className="flex justify-between items-baseline mb-5">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold text-white tabular">{finalNominal > 0 ? formatRp(finalNominal) : '—'}</span>
          </div>
          {payErr && <div className="alert alert-danger mb-3"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{payErr}</span></div>}
          <button onClick={startPayment} disabled={finalNominal <= 0 || creating} className="btn btn-primary btn-lg btn-block">
            {creating
              ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Membuat QRIS...</>
              : <><Icon name="qr" size={18} /> Bayar via QRIS · {finalNominal > 0 ? formatRp(finalNominal) : '—'}</>}
          </button>
          <p className="hint mt-3 text-center">Nominal unik ditambahkan otomatis. Saldo bertambah setelah top up dikonfirmasi.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Riwayat top up</h2>
            <p className="text-xs text-muted-foreground mt-0.5">10 transaksi terakhir</p>
          </div>
          <button onClick={loadHistory} className="btn btn-ghost btn-icon btn-sm -mr-2" aria-label="Muat ulang riwayat"><Icon name="refresh" size={16} /></button>
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

      {payment && (
        <QRISModal total={payment.amount} paymentId={payment.id} expiresAt={payment.expiresAt} onClose={() => setPayment(null)}
          onDone={() => { onPaid(); loadHistory(); setPayment(null); setNominal(null); setCustom('') }} />
      )}
    </div>
  )
}
