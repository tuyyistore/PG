
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
