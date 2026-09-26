
import logoFlip from '../assets/payments/flip.svg'
import logoOvo from '../assets/payments/ovo.svg'
import logoDoku from '../assets/payments/doku.svg'
import logoGopay from '../assets/payments/gopay.svg'
import logoDana from '../assets/payments/dana.svg'
import logoQris from '../assets/payments/qris.svg'
import logoSuperbank from '../assets/payments/superbank.svg'
import logoMandiri from '../assets/payments/mandiri.svg'
import logoSeabank from '../assets/payments/seabank.svg'

export const PAYMENT_LOGOS: { name: string; src: string }[] = [
  { name: 'QRIS', src: logoQris },
  { name: 'GoPay', src: logoGopay },
  { name: 'OVO', src: logoOvo },
  { name: 'DANA', src: logoDana },
  { name: 'Bank Mandiri', src: logoMandiri },
  { name: 'SeaBank', src: logoSeabank },
  { name: 'Super Bank', src: logoSuperbank },
  { name: 'DOKU', src: logoDoku },
  { name: 'Flip', src: logoFlip },
]

// ─── Pilihan metode pembayaran (dikirim ke /api/create-payment sebagai `method`) ─
// Key di sini harus sinkron dengan api/_paymentMethods.js di backend.
export interface PaymentMethodOption {
  id: string
  label: string
  hint: string
  group: 'Otomatis' | 'E-Wallet' | 'Virtual Account'
  logo?: string
  /** Dipakai kalau belum ada logo SVG-nya (mis. bank tanpa aset). */
  initials?: string
}

export const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  { id: 'qris', label: 'QRIS', hint: 'E-wallet & semua m-banking, tinggal scan', group: 'Otomatis', logo: logoQris },
  { id: 'ovo', label: 'OVO', hint: 'Bayar langsung dari aplikasi OVO', group: 'E-Wallet', logo: logoOvo },
  { id: 'dana', label: 'DANA', hint: 'Bayar langsung dari aplikasi DANA', group: 'E-Wallet', logo: logoDana },
  { id: 'shopeepay', label: 'ShopeePay', hint: 'Bayar langsung dari aplikasi Shopee', group: 'E-Wallet', initials: 'SP' },
  { id: 'va_bca', label: 'Virtual Account BCA', hint: 'Transfer via ATM/m-banking/klikBCA', group: 'Virtual Account', initials: 'BCA' },
  { id: 'va_mandiri', label: 'Virtual Account Mandiri', hint: 'Transfer via ATM/Livin\' by Mandiri', group: 'Virtual Account', logo: logoMandiri },
  { id: 'va_bni', label: 'Virtual Account BNI', hint: 'Transfer via ATM/BNI Mobile Banking', group: 'Virtual Account', initials: 'BNI' },
  { id: 'va_bri', label: 'Virtual Account BRI', hint: 'Transfer via ATM/BRImo', group: 'Virtual Account', initials: 'BRI' },
]

/** Ikon kotak untuk metode yang belum punya aset logo SVG (mis. VA BCA/BNI/BRI, ShopeePay). */
export function PaymentMethodBadge({ option, size = 36 }: { option: PaymentMethodOption; size?: number }) {
  if (option.logo) {
    return (
      <div className="rounded-lg bg-white flex items-center justify-center flex-shrink-0 px-1.5" style={{ width: size * 1.3, height: size }}>
        <img src={option.logo} alt={option.label} className="max-h-4 max-w-full object-contain" />
      </div>
    )
  }
  return (
    <div
      className="rounded-lg flex items-center justify-center flex-shrink-0 text-[11px] font-bold tracking-wide text-white"
      style={{ width: size * 1.3, height: size, background: 'linear-gradient(135deg, #4d8dff 0%, #2657c9 100%)' }}
    >
      {option.initials ?? option.label.slice(0, 2).toUpperCase()}
    </div>
  )
}

export function PaymentMethodsCard() {
  return (
    <div className="mt-5">
      <p className="eyebrow mb-3">Didukung melalui QRIS</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {PAYMENT_LOGOS.map(p => (
          <div key={p.name} title={p.name} className="flex items-center justify-center h-11 rounded-xl px-3 bg-white/[0.96]">
            <img src={p.src} alt={p.name} className="max-h-[18px] max-w-full object-contain" />
          </div>
        ))}
      </div>
      <p className="hint mt-3">Semua metode di atas diproses otomatis lewat QRIS — tinggal scan pakai e-wallet atau m-banking favoritmu.</p>
    </div>
  )
}
