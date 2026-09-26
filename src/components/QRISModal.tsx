import logoQris from '../assets/payments/qris.svg'
import { useEffect, useState } from 'react'
import { Icon, formatRp } from '../ui'
import { useToast, playSuccessSound } from '../feedback'

// ─── QRIS Modal (checkout QRIS di-embed langsung dari DOKU) ───────────────────

export function useCountdown(until?: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [until])
  if (!until) return null
  const left = Math.max(0, Math.floor((until - now) / 1000))
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` }
}

export function QRISModal({ total, paymentId, paymentUrl, expiresAt, onClose, onDone }: { total: number; paymentId: number; paymentUrl: string; expiresAt?: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const countdown = useCountdown(expiresAt)
  const copyAmount = async () => {
    try { await navigator.clipboard.writeText(String(total)); toast('Nominal disalin: ' + formatRp(total)) }
    catch { toast('Gagal menyalin nominal', 'error') }
  }
  const [done, setDone] = useState(false)
  const [warn, setWarn] = useState('')

  useEffect(() => {
    if (done) return
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/check-payment?paymentId=${paymentId}`)
        const d = await r.json()
        if (d.status === 'paid') { setDone(true); playSuccessSound() }
        else if (d.status === 'expired') setWarn('QRIS ini sudah kedaluwarsa, tutup dan ulangi.')
        else if (d.warning) setWarn(d.warning)
      } catch { /* diamkan, coba lagi di interval berikutnya */ }
    }, 6000)
    return () => clearInterval(iv)
  }, [paymentId, done])

  if (done) {
    return (
      <div className="overlay">
        <div className="dialog p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
            <Icon name="check" size={24} strokeWidth={2.25} />
          </div>
          <span className="badge badge-success mb-3">Pembayaran berhasil</span>
          <h3 className="text-lg font-semibold text-white tracking-tight mb-2">Terima kasih</h3>
          <p className="hint mb-6">Detail layanan dikirim ke WhatsApp &amp; Email dalam 5 menit.</p>
          <button onClick={onDone} className="btn btn-primary btn-lg btn-block">Kembali ke Dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="qr" size={18} /></div>
            <div>
              <h3 className="text-sm font-semibold text-white">Bayar dengan QRIS</h3>
              <p className="text-xs text-muted-foreground">Pembayaran terverifikasi otomatis</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-center">
            <p className="eyebrow">Total pembayaran</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-[28px] leading-9 font-semibold text-white tracking-tight tabular">{formatRp(total)}</p>
              <button onClick={copyAmount} className="btn btn-ghost btn-icon btn-sm" aria-label="Salin nominal" title="Salin nominal"><Icon name="copy" size={16} /></button>
            </div>
            {countdown && (
              <p className={`text-xs mt-1 tabular flex items-center justify-center gap-1.5 ${countdown.left < 300 ? 'text-[#fbbf24]' : 'text-muted-foreground'}`}>
                <Icon name="clock" size={13} />
                {countdown.left > 0 ? <>Berlaku <span className="font-medium">{countdown.label}</span> lagi</> : 'QRIS sudah kedaluwarsa'}
              </p>
            )}
          </div>

          <div className="bg-white rounded-2xl p-3 flex flex-col items-center justify-center min-h-[300px]">
            <iframe src={paymentUrl} title="Bayar QRIS via DOKU" className="w-full rounded-md border-0" style={{ minHeight: 280 }} />
            <img src={logoQris} alt="QRIS" className="h-4 mt-3 object-contain" />
          </div>

          <div className="alert alert-warning">
            <Icon name="info" size={16} className="mt-0.5" />
            <span>Bayar persis sesuai nominal ini ya.</span>
          </div>

          <p className="hint text-center">Scan via GoPay · OVO · Dana · BCA · Mandiri</p>

          {warn && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{warn}</span></div>}

          <div className="h-12 rounded-[14px] flex items-center justify-center gap-2.5 text-sm font-medium text-slate-300" style={{ background: '#121a2b', border: '1px solid #2a3448' }}>
            <span className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-[#4f7cff] animate-spin" />
            Menunggu pembayaran otomatis…
          </div>
        </div>
      </div>
    </div>
  )
}
