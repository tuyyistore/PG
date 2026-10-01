import { useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, ProductThumb, PageHeader } from '../ui'
import { type CartItem } from '../types'

// ─── Checkout Page ────────────────────────────────────────────────────────────

export function CheckoutPage({ cart, saldo, profile, onBack, onBoughtWithSaldo, onGoTopUp }: { cart: CartItem[]; saldo: number; profile: Row | null; onBack: () => void; onBoughtWithSaldo: () => void; onGoTopUp: () => void }) {
  const [buying, setBuying] = useState(false)
  const [err, setErr] = useState('')
  const subtotal = cart.reduce((s, i) => s + i.product.price, 0)
  const [code, setCode] = useState('')
  const [applied, setApplied] = useState<{ code: string; discount: number } | null>(null)
  const [voucherMsg, setVoucherMsg] = useState('')
  const [checking, setChecking] = useState(false)
  const discount = applied?.discount ?? 0
  const total = Math.max(subtotal - discount, 0)
  const cukup = saldo >= total

  useEffect(() => { setApplied(null); setVoucherMsg('') }, [subtotal])

  async function applyVoucher() {
    const c = code.trim()
    if (!c) return
    setChecking(true); setVoucherMsg('')
    try {
      const rows = await api('rpc/check_voucher', { method: 'POST', body: { p_code: c, p_total: subtotal } })
      const r = rows?.[0]
      if (r?.valid) { setApplied({ code: c, discount: Number(r.discount) }); setVoucherMsg('') }
      else { setApplied(null); setVoucherMsg(r?.message ?? 'Voucher tidak valid') }
    } catch (e) { setApplied(null); setVoucherMsg((e as Error).message) } finally { setChecking(false) }
  }

  function removeVoucher() { setApplied(null); setCode(''); setVoucherMsg('') }

  async function buyWithSaldo() {
    setBuying(true); setErr('')
    try {
      await api('rpc/buy_with_saldo', { method: 'POST', body: { item_ids: cart.map(i => i.product.id), voucher_code: applied?.code ?? null } })
      onBoughtWithSaldo()
    } catch (e) { setErr((e as Error).message || 'Gagal memproses pembelian. Coba lagi.'); setBuying(false) }
  }

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="Checkout" subtitle="Periksa pesananmu sebelum membayar."
        leading={<button onClick={onBack} className="btn btn-secondary btn-icon flex-shrink-0" aria-label="Kembali"><Icon name="arrowLeft" size={18} /></button>} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-6 items-start">
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="section-title">Item pesanan</h2>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {cart.map(i => (
                <div key={i.product.id} className="flex items-center gap-4 px-4 sm:px-5 py-4">
                  <ProductThumb url={i.product.logoUrl} size={40} iconSize={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{i.product.name}</p>
                    <p className="text-xs text-muted-foreground">{i.product.period}</p>
                  </div>
                  <p className="text-sm font-semibold text-white tabular">{formatRp(i.product.price)}</p>
                </div>
              ))}
            </div>
          </div>

          {(profile?.contact_email || profile?.whatsapp) && (
            <div className="alert alert-info">
              <Icon name="mail" size={16} className="mt-0.5 flex-shrink-0" />
              <p>
                Data akun akan dikirim otomatis ke <span className="text-white font-medium">{profile?.contact_email || '-'}</span>
                {profile?.whatsapp && <> &amp; WA <span className="text-white font-medium">{profile.whatsapp}</span></>}.
                {' '}Bisa diubah di menu Pengaturan.
              </p>
            </div>
          )}
        </div>

        <div className="card p-5 sm:p-6 lg:sticky lg:top-24 space-y-4">
          <h2 className="section-title">Pembayaran</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({cart.length} item)</dt><dd className="text-white tabular">{formatRp(subtotal)}</dd></div>
            {discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Voucher {applied?.code}</dt><dd className="tabular" style={{ color: '#4ade80' }}>- {formatRp(discount)}</dd></div>}
            <div className="flex justify-between"><dt className="text-muted-foreground">Saldo kamu</dt><dd className="text-white tabular">{formatRp(saldo)}</dd></div>
          </dl>
          <div className="divider" />
          {applied ? (
            <div className="flex items-center justify-between gap-2 card-inset px-3.5 py-2.5">
              <span className="text-[13px] text-white font-medium truncate">Voucher {applied.code} dipakai</span>
              <button type="button" onClick={removeVoucher} className="btn btn-ghost btn-sm">Hapus</button>
            </div>
          ) : (
            <div>
              <div className="flex gap-2">
                <input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Kode voucher" aria-label="Kode voucher" onKeyDown={e => { if (e.key === 'Enter') applyVoucher() }} />
                <button type="button" onClick={applyVoucher} disabled={checking || !code.trim()} className="btn btn-secondary flex-shrink-0">{checking ? '...' : 'Pakai'}</button>
              </div>
              {voucherMsg && <p className="text-xs mt-1.5" style={{ color: '#f87171' }}>{voucherMsg}</p>}
            </div>
          )}
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold text-white tabular">{formatRp(total)}</span>
          </div>

          {cukup ? (
            <>
              <div className="alert alert-success">
                <Icon name="wallet" size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-white">Dibayar pakai Saldo</p>
                  <p className="text-[13px] opacity-90">Saldo kamu {formatRp(saldo)} — cukup untuk pesanan ini</p>
                </div>
              </div>

              {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

              <button onClick={buyWithSaldo} disabled={buying} className="btn btn-primary btn-lg btn-block">
                {buying ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Memproses...</> : <>Beli Sekarang <Icon name="check" size={18} strokeWidth={2.25} /></>}
              </button>
            </>
          ) : (
            <>
              <div className="alert alert-warning">
                <Icon name="wallet" size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-white">Saldo Anda tidak cukup</p>
                  <p className="text-[13px] opacity-90">Silakan top up terlebih dahulu. Saldo kamu {formatRp(saldo)}, dibutuhkan {formatRp(total)}.</p>
                </div>
              </div>

              <button onClick={onGoTopUp} className="btn btn-primary btn-lg btn-block">
                <Icon name="card" size={18} /> Top Up Saldo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
