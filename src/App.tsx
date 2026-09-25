import { useEffect, useState } from 'react'
import { ADMIN_EMAIL, api, configured, displayName, initSession, signInWithGoogle, signOut, uploadFile, type Row, type Session, type SessionUser } from './lib/supabase'
import { Icon, TONE, formatRp, ProductThumb, type IconName } from './ui'
import AdminPage from './Admin'
import { buildDynamicQris } from './lib/qris'
import logoFlip from './assets/payments/flip.svg'
import logoOvo from './assets/payments/ovo.svg'
import logoDoku from './assets/payments/doku.svg'
import logoGopay from './assets/payments/gopay.svg'
import logoDana from './assets/payments/dana.svg'
import logoQris from './assets/payments/qris.svg'
import logoSuperbank from './assets/payments/superbank.svg'
import logoMandiri from './assets/payments/mandiri.svg'
import logoSeabank from './assets/payments/seabank.svg'

const PAYMENT_LOGOS: { name: string; src: string }[] = [
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

// ─── Design Tokens (matched from panelbot.id reference) ───────────────────────
// bg-page:   #0b0d18  (very dark navy-black)
// bg-card:   #171d36  (slightly lighter navy)
// bg-card2:  #0f1220  (darker card variant)
// border:    #2a3154  (subtle)
// text:      #ffffff
// muted:     #8f9bbd
// blue:      #3d7ef5
// blue-icon-bg: #172050
// green-icon-bg: #0f3320  green: #22c55e
// gold-icon-bg:  #2d2008  gold:  #d4a830
// cyan-icon-bg:  #0c2a30  cyan:  #22d3ee


// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: number
  name: string
  category: string
  tagline: string
  price: number
  originalPrice?: number
  period: string
  features: string[]
  badge?: string
  popular?: boolean
  iconBg: string
  iconColor: string
  icon: IconName
  logoUrl?: string
}

interface CartItem { product: Product; qty: number }

interface Order {
  id: string
  product: Product
  status: 'aktif' | 'nonaktif' | 'pending'
  date: string
  accountData?: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────
// Catatan: tidak ada lagi produk contoh bawaan di sini. Semua produk & kategori
// 100% berasal dari database (tabel `products` & `categories` di Supabase),
// dikelola sepenuhnya lewat Dashboard Admin.

// ─── QRIS Modal ───────────────────────────────────────────────────────────────

function QRISModal({ total, paymentId, onClose, onDone }: { total: number; paymentId: number; onClose: () => void; onDone: () => void }) {
  const [done, setDone] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [warn, setWarn] = useState('')

  useEffect(() => {
    let stop = false
    const staticQris = (import.meta.env?.VITE_QRIS_STATIC_STRING as string | undefined) ?? ''
    if (staticQris) {
      import('qrcode').then(QRCode => {
        const payload = buildDynamicQris(staticQris, total)
        QRCode.toDataURL(payload, { margin: 1, width: 320 }).then(url => { if (!stop) setQrUrl(url) })
      })
    }
    return () => { stop = true }
  }, [total])

  useEffect(() => {
    if (done) return
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/check-payment?paymentId=${paymentId}`)
        const d = await r.json()
        if (d.status === 'paid') setDone(true)
        else if (d.status === 'expired') setWarn('QRIS ini sudah kedaluwarsa, tutup dan ulangi.')
        else if (d.warning) setWarn(d.warning)
      } catch { /* diamkan, coba lagi di interval berikutnya */ }
    }, 6000)
    return () => clearInterval(iv)
  }, [paymentId, done])

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#03040a]/95 p-4">
        <div className="w-full max-w-sm rounded-2xl p-8 text-center" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
          <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-5 text-white"><Icon name="check" size={30} strokeWidth={3} /></div>
          <p className="text-xs tracking-widest uppercase mb-2" style={{ color: '#22c55e' }}>Pembayaran Berhasil</p>
          <h3 className="font-display font-800 text-xl text-white mb-3">Terima Kasih!</h3>
          <p className="text-xs mb-6 leading-relaxed" style={{ color: '#8f9bbd' }}>Detail layanan dikirim ke WhatsApp & Email dalam 5 menit.</p>
          <button onClick={onDone} className="w-full text-white font-display font-700 text-xs tracking-widest uppercase py-3.5 rounded-xl transition-colors" style={{ background: '#3d7ef5' }}>
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#03040a]/95 p-4">
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-700 text-white text-sm">Bayar dengan QRIS</h3>
          <button onClick={onClose} style={{ color: '#8f9bbd' }} className="w-8 h-8 rounded-full flex items-center justify-center hover:text-white transition-colors" aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>

        <div className="bg-white rounded-xl p-5 mb-4 flex flex-col items-center min-h-[210px] justify-center">
          {qrUrl ? (
            <img src={qrUrl} alt="QRIS" width={180} height={180} className="rounded" />
          ) : (
            <p className="text-[11px] text-center px-4" style={{ color: '#64748b' }}>QRIS statis belum diatur (VITE_QRIS_STATIC_STRING).</p>
          )}
          <div className="flex items-center gap-1 mt-3">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <div className="w-4 h-4 rounded-full bg-blue-500 -ml-1.5" />
            <span className="text-[10px] font-bold text-black ml-1 tracking-wider">QRIS</span>
          </div>
        </div>

        <div className="rounded-xl p-3.5 mb-4 text-center" style={{ background: '#0b0d18' }}>
          <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#8f9bbd' }}>Total Pembayaran (nominal unik)</p>
          <p className="font-display font-800 text-2xl text-white">{formatRp(total)}</p>
          <p className="text-[10px] mt-1" style={{ color: '#f59e0b' }}>Bayar persis sesuai nominal ini ya, termasuk 2 digit terakhir</p>
        </div>

        <p className="text-[11px] text-center mb-4 leading-relaxed" style={{ color: '#8f9bbd' }}>
          Scan via GoPay · OVO · Dana · BCA · Mandiri
        </p>

        {warn && <p className="text-[11px] text-center mb-3" style={{ color: '#f87171' }}>{warn}</p>}

        <div className="w-full text-white font-display font-700 text-xs tracking-widest uppercase py-3.5 rounded-xl flex items-center justify-center gap-2" style={{ background: '#2f3860' }}>
          <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          Menunggu Pembayaran Otomatis...
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar Drawer ───────────────────────────────────────────────────────────

// ─── Auth UI & mapper data ────────────────────────────────────────────────────

function Avatar({ user, size }: { user: SessionUser; size: number }) {
  const url = user.user_metadata?.avatar_url || user.user_metadata?.picture
  return url
    ? <img src={url} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-full flex items-center justify-center font-display font-800 text-white flex-shrink-0" style={{ width: size, height: size, background: TONE.blue, fontSize: size * 0.42 }}>{displayName(user).charAt(0).toUpperCase()}</div>
}

function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0b0d18' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <span className="font-display font-800 text-4xl" style={{ color: '#3d7ef5' }}>p<span style={{ color: '#60a5fa' }}>b</span></span>
        <h1 className="font-display font-800 text-xl text-white mt-4 mb-1">Masuk ke Akun</h1>
        <p className="text-xs mb-6 leading-relaxed" style={{ color: '#8f9bbd' }}>Lanjutkan dengan akun Google. Admin masuk dengan email Google yang terdaftar sebagai admin.</p>
        <button onClick={signInWithGoogle} disabled={!configured}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-display font-700 text-sm transition hover:brightness-95 disabled:cursor-not-allowed"
          style={{ background: configured ? '#ffffff' : '#2f3860', color: configured ? '#1f2937' : '#8f9bbd' }}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
          Lanjutkan dengan Google
        </button>
        {!configured && <p className="text-[11px] mt-4 leading-relaxed" style={{ color: '#fbbf24' }}>Database belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Environment Variables Vercel.</p>}
      </div>
    </div>
  )
}

const rowToProduct = (r: Row): Product => ({
  id: r.id, name: r.name, category: r.category, tagline: r.tagline ?? '', price: Number(r.price),
  originalPrice: r.original_price ? Number(r.original_price) : undefined, period: r.period ?? '',
  features: r.features ?? [], badge: r.badge ?? undefined, popular: r.popular,
  iconBg: TONE[r.tone as keyof typeof TONE] ?? TONE.blue, iconColor: '#ffffff', icon: r.icon in { zap: 1, rocket: 1, building: 1, gem: 1, monitor: 1, settings: 1, infinity: 1, wrench: 1, refresh: 1, shield: 1, server: 1, package: 1 } ? r.icon : 'package',
  logoUrl: r.logo_url ?? undefined,
})

const rowToOrder = (r: Row): Order => ({
  id: 'ORD-' + r.id,
  product: rowToProduct({ ...r, id: r.id, name: r.product_name, tagline: '', features: [], popular: false, logo_url: r.logo_url }),
  status: r.status,
  date: new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
  accountData: r.account_data ?? undefined,
})

// ─── Detail Pesanan Modal (data akun/info penting yang dikirim admin) ─────────

function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#03040a]/90 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: '#171d36', border: '1px solid #2a3154' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <ProductThumb url={order.product.logoUrl} size={40} iconSize={20} />
            <div className="min-w-0"><p className="font-display font-700 text-white text-sm truncate">{order.product.name}</p><p className="text-[10px]" style={{ color: '#8f9bbd' }}>{order.id} · {order.date}</p></div>
          </div>
          <button onClick={onClose} style={{ color: '#8f9bbd' }} className="w-8 h-8 rounded-full flex items-center justify-center hover:text-white transition-colors flex-shrink-0" aria-label="Tutup"><Icon name="x" size={16} /></button>
        </div>
        <div className="rounded-xl p-3.5" style={{ background: '#0b0d18', border: '1px solid #2a3154' }}>
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: '#8f9bbd' }}>Data Akun / Informasi Penting</p>
          {order.accountData ? (
            <p className="text-xs text-white whitespace-pre-wrap leading-relaxed">{order.accountData}</p>
          ) : (
            <p className="text-xs" style={{ color: '#8f9bbd' }}>Belum ada data yang dikirim admin untuk pesanan ini. Silakan hubungi support jika perlu.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose, activePage, onNav, user, profile, isAdmin, onLogout }: {
  open: boolean; onClose: () => void; activePage: string; onNav: (p: string) => void
  user: SessionUser; profile: Row | null; isAdmin: boolean; onLogout: () => void
}) {
  const shownUser: SessionUser = profile?.avatar_url ? { ...user, user_metadata: { ...user.user_metadata, avatar_url: profile.avatar_url } } : user
  const shownName = profile?.full_name || displayName(user)
  const items: { id: string; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' as IconName },
    { id: 'produk',    label: 'Produk',    icon: 'package' as IconName },
    { id: 'pesanan',   label: 'Pesanan Saya', icon: 'clipboard' as IconName },
    { id: 'saldo',     label: 'Top Up Saldo', icon: 'card' as IconName },
    ...(isAdmin ? [{ id: 'admin', label: 'Dashboard Admin', icon: 'shield' as IconName }] : []),
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-[#03040a]/90" onClick={onClose} />}
      <aside
        className={`fixed top-0 left-0 h-full w-64 z-40 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: '#0f1220', borderRight: '1px solid #2a3154' }}
      >
        {/* User info */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #2a3154' }}>
          <Avatar user={shownUser} size={40} />
          <div className="min-w-0">
            <p className="font-display font-700 text-white text-sm truncate">{shownName}</p>
            <p className="text-[10px] truncate" style={{ color: '#8f9bbd' }}>{user.email}</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => { onNav(item.id); onClose() }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-left transition-all"
              style={{
                background: activePage === item.id ? '#1f3a80' : '#0f1220',
                color: activePage === item.id ? '#ffffff' : '#8f9bbd',
              }}
            >
              <Icon name={item.icon} size={19} />
              <span className="font-display font-600">{item.label}</span>
              {activePage === item.id && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#3d7ef5' }} />}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-5" style={{ borderTop: '1px solid #2a3154', paddingTop: '12px' }}>
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors" style={{ color: '#ef4444' }}>
            <Icon name="logout" size={19} /><span className="font-display font-600">Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Header — matches panelbot exactly ───────────────────────────────────────

function Header({ onMenuOpen, onProfileClick, showDropdown, onProfileAction, onSettingsClick }: {
  onMenuOpen: () => void
  onProfileClick: (e: React.MouseEvent) => void
  showDropdown: boolean
  onProfileAction: (a: string) => void
  onSettingsClick: () => void
}) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-20 h-14 flex items-center px-4 justify-between"
      style={{ background: '#0b0d18' }}
    >
      {/* Hamburger — 3 lines exactly like reference */}
      <button
        onClick={onMenuOpen}
        className="flex flex-col justify-center gap-[5px] w-9 h-9 items-start"
      >
        <span className="block w-[22px] h-[2px] rounded-full bg-white" />
        <span className="block w-[16px] h-[2px] rounded-full bg-white" />
        <span className="block w-[22px] h-[2px] rounded-full bg-white" />
      </button>

      {/* Logo center — "pb" wordmark style */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <span className="font-display font-800 text-2xl tracking-tight" style={{ color: '#3d7ef5' }}>
          p<span style={{ color: '#60a5fa' }}>b</span>
        </span>
      </div>

      {/* Right icons */}
      <div className="flex items-center gap-2">
        {/* Settings gear */}
        <button
          onClick={onSettingsClick}
          aria-label="Pengaturan"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:brightness-125"
          style={{ background: '#2a3154' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Avatar + dropdown */}
        <div className="relative">
          <button
            onClick={onProfileClick}
            className="relative w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: '#2a2f45' }}
          >
            {/* person icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#9ca3af">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            {/* online dot */}
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full"
              style={{ background: '#22c55e', border: '2px solid #0b0d18' }}
            />
          </button>

          {showDropdown && (
            <div
              className="absolute right-0 top-11 w-44 rounded-xl overflow-hidden shadow-2xl"
              style={{ background: '#171d36', border: '1px solid #2a3154' }}
            >
              {['My Profile', 'Settings', 'Logout'].map((a, i) => (
                <button
                  key={a}
                  onClick={() => onProfileAction(a)}
                  className="w-full text-left px-5 py-3.5 text-sm font-display font-500 transition-colors"
                  style={{
                    color: a === 'Logout' ? '#ef4444' : '#ffffff',
                    borderTop: i > 0 ? '1px solid #2a3154' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a3154')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#171d36')}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Stat Card — full width, icon left, label above value ─────────────────────

function StatCard({ iconBg, iconColor, iconSvg, label, value, large }: {
  iconBg: string; iconColor: string; iconSvg: React.ReactNode
  label: string; value: string; large?: boolean
}) {
  return (
    <div
      className="flex items-center gap-4 rounded-2xl px-4 py-4 w-full"
      style={{ background: '#171d36', border: '1px solid #2a3154' }}
    >
      <div
        className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: iconBg }}
      >
        <span style={{ color: iconColor }}>{iconSvg}</span>
      </div>
      <div>
        <p className="text-sm mb-1" style={{ color: '#8f9bbd' }}>{label}</p>
        <p
          className="font-display font-800 leading-none text-white"
          style={{ fontSize: large ? '28px' : '26px' }}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage({ orders, saldo, onNav, onDetail }: { orders: Order[]; saldo: number; onNav: (p: string) => void; onDetail: (o: Order) => void }) {
  const dibeli = orders.filter(o => o.status === 'aktif').length
  const pendingOrders = orders.filter(o => o.status === 'pending').length
  const dibatalkan = orders.filter(o => o.status === 'nonaktif').length

  return (
    <div className="space-y-3.5">
      <h1 className="font-display font-800 text-2xl text-white pt-1">Dashboard</h1>

      {/* Quick actions — ditaruh di atas, tepat di bawah judul Dashboard */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onNav('produk')} className="py-4 rounded-2xl font-display font-700 text-xs tracking-widest uppercase text-white transition hover:brightness-110 flex items-center justify-center gap-2" style={{ background: '#3d7ef5' }}>
          <Icon name="plus" size={16} strokeWidth={2.5} /> Beli Produk
        </button>
        <button onClick={() => onNav('saldo')} className="py-4 rounded-2xl font-display font-700 text-xs tracking-widest uppercase text-white transition hover:brightness-125 flex items-center justify-center gap-2" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
          <Icon name="wallet" size={16} /> Top Up
        </button>
      </div>

      <StatCard iconBg={TONE.green} iconColor="#ffffff" iconSvg={<Icon name="circleCheck" size={26} />} label="Total Produk Dibeli" value={String(dibeli)} />
      <StatCard iconBg={TONE.gold} iconColor="#ffffff" iconSvg={<Icon name="refresh" size={26} />} label="Total Produk Pending" value={String(pendingOrders)} />
      <StatCard iconBg={TONE.pink} iconColor="#ffffff" iconSvg={<Icon name="x" size={26} />} label="Total Produk Dibatalkan" value={String(dibatalkan)} />
      <StatCard iconBg={TONE.purple} iconColor="#ffffff" iconSvg={<Icon name="wallet" size={26} />} label="Saldo" value={formatRp(saldo)} large />

      {/* Produk Saya card */}
      <div className="rounded-2xl p-4 w-full" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-700 text-white text-base">Produk Saya</h2>
          <button onClick={() => onNav('pesanan')} className="text-[11px] font-display font-600 tracking-widest uppercase" style={{ color: '#3d7ef5' }}>
            Lihat Semua
          </button>
        </div>

        {orders.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3" style={{ color: '#3a4a6a' }}>
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ border: '2px solid #2a3154' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <p className="text-sm">Belum ada server untuk ditampilkan</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map(o => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: '#0b0d18' }}>
                <ProductThumb url={o.product.logoUrl} size={36} iconSize={18} />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-600 text-white text-xs truncate">{o.product.name}</p>
                  <p className="text-[10px]" style={{ color: '#8f9bbd' }}>{o.id} · {o.date}</p>
                </div>
                {o.status === 'aktif' ? (
                  <button onClick={() => onDetail(o)}
                    className="text-[10px] font-display font-700 px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1 transition hover:brightness-110"
                    style={{ background: '#0f3320', color: '#22c55e' }}>
                    <Icon name="eye" size={11} /> Lihat Detail
                  </button>
                ) : (
                  <span className="text-[10px] font-display font-700 px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: '#2a3154', color: '#8f9bbd' }}>{o.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Support Button (buka live chat Chaport) ──────────────────────────────────

function SupportButton() {
  const openChat = () => {
    const w = window as unknown as { chaport?: { q: (...args: unknown[]) => void } }
    w.chaport?.q('open')
  }
  return (
    <button
      onClick={openChat}
      aria-label="Live Chat Support"
      className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition hover:brightness-110 active:scale-95"
      style={{ background: TONE.blue, boxShadow: '0 8px 24px rgba(61,126,245,0.45)' }}
    >
      <img
        src="https://img.icons8.com/ios-filled/50/FFFFFF/customer-support.png"
        alt=""
        width={26}
        height={26}
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }}
      />
    </button>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ p, onAdd, inCart }: { p: Product; onAdd: () => void; inCart: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#171d36', border: `1px solid ${p.popular ? '#2a4a8a' : '#2a3154'}` }}
    >
      <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <ProductThumb url={p.logoUrl} size={44} iconSize={22} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-display font-700 text-white text-sm">{p.name}</p>
            {p.badge && (
              <span className="text-[9px] font-display font-700 px-2 py-0.5 rounded-full flex-shrink-0"
                style={p.popular ? { background: '#3d7ef5', color: '#fff' } : { background: '#2a3154', color: '#8f9bbd' }}>
                {p.badge}
              </span>
            )}
          </div>
          <p className="text-[11px] truncate" style={{ color: '#8f9bbd' }}>{p.tagline}</p>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <p className="font-display font-800 text-white text-sm">{formatRp(p.price)}</p>
          <p className="text-[10px]" style={{ color: '#8f9bbd' }}>{p.period}</p>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid #2a3154' }} className="px-4 py-3">
          <ul className="grid grid-cols-2 gap-y-1.5 gap-x-3 mb-3">
            {p.features.map(f => (
              <li key={f} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#8892a4' }}>
                <span style={{ color: '#4d8dff' }}><Icon name="check" size={13} strokeWidth={3} /></span>{f}
              </li>
            ))}
          </ul>
          {p.originalPrice && (
            <p className="text-[10px] mb-2 line-through" style={{ color: '#8f9bbd' }}>{formatRp(p.originalPrice)}{p.period}</p>
          )}
          <button
            onClick={onAdd}
            disabled={inCart}
            className="w-full py-3 rounded-xl font-display font-700 text-xs tracking-widest uppercase text-white transition hover:brightness-110 disabled:cursor-default flex items-center justify-center gap-2"
            style={{ background: inCart ? '#14532d' : '#3d7ef5', color: inCart ? '#4ade80' : '#fff' }}
          >
            {inCart ? <><Icon name="check" size={15} strokeWidth={3} /> Ditambahkan</> : <><Icon name="cart" size={15} /> Tambah ke Keranjang</>}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Produk Page ──────────────────────────────────────────────────────────────

function ProdukPage({ cart, onAdd, products, categories }: { cart: CartItem[]; onAdd: (p: Product) => void; products: Product[]; categories: string[] }) {
  const [tab, setTab] = useState('Semua')
  // Tab kategori diambil langsung dari kategori yang dibuat admin di database,
  // jadi kategori baru otomatis muncul di sini tanpa perlu ubah kode.
  const tabs = ['Semua', ...categories]
  const filtered = tab === 'Semua' ? products : products.filter(p => p.category === tab)
  const cartIds = new Set(cart.map(i => i.product.id))

  return (
    <div className="space-y-4">
      <h1 className="font-display font-800 text-2xl text-white pt-1">Produk</h1>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-display font-700 tracking-widest uppercase transition-all"
            style={tab === t
              ? { background: '#3d7ef5', color: '#fff' }
              : { background: '#171d36', color: '#8f9bbd', border: '1px solid #2a3154' }}>
            {t}
          </button>
        ))}
      </div>
      <div className="space-y-2.5">
        {filtered.length === 0 && <p className="text-xs text-center py-10" style={{ color: '#8f9bbd' }}>Belum ada produk.</p>}
        {filtered.map(p => (
          <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} inCart={cartIds.has(p.id)} />
        ))}
      </div>
    </div>
  )
}

// ─── Pesanan Page ─────────────────────────────────────────────────────────────

function PesananPage({ orders, onDetail }: { orders: Order[]; onDetail: (o: Order) => void }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display font-800 text-2xl text-white pt-1">Pesanan Saya</h1>
      {orders.length === 0 ? (
        <div className="rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: '#171d36', border: '1px solid #2a3154', color: '#8f9bbd' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ border: '2px solid #2a3154' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </div>
          <p className="text-sm">Belum ada pesanan untuk ditampilkan</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {orders.map(o => (
            <div key={o.id} className="rounded-2xl p-4" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
              <div className="flex items-center gap-3 mb-3">
                <ProductThumb url={o.product.logoUrl} size={40} iconSize={20} />
                <div className="flex-1">
                  <p className="font-display font-700 text-white text-sm">{o.product.name}</p>
                  <p className="text-[10px]" style={{ color: '#8f9bbd' }}>{o.id} · {o.date}</p>
                </div>
                {o.status === 'aktif' ? (
                  <button onClick={() => onDetail(o)}
                    className="text-[10px] font-display font-700 px-2.5 py-1 rounded-full flex items-center gap-1 transition hover:brightness-110"
                    style={{ background: '#0f3320', color: '#22c55e' }}>
                    <Icon name="eye" size={11} /> Lihat Detail
                  </button>
                ) : (
                  <span className="text-[10px] font-display font-700 px-2.5 py-1 rounded-full" style={{ background: '#2a3154', color: '#8f9bbd' }}>{o.status}</span>
                )}
              </div>
              <div className="flex justify-between items-center pt-3" style={{ borderTop: '1px solid #2a3154' }}>
                <span className="text-xs" style={{ color: '#8f9bbd' }}>{o.product.category}</span>
                <span className="font-display font-800 text-white text-sm">{formatRp(o.product.price)}<span className="text-xs font-400" style={{ color: '#8f9bbd' }}>{o.product.period}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Saldo Page ───────────────────────────────────────────────────────────────

function SaldoPage({ saldo, onPaid }: { saldo: number; onPaid: () => void }) {
  const [nominal, setNominal] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [payment, setPayment] = useState<{ id: number; amount: number } | null>(null)
  const presets = [10000, 25000, 50000, 100000, 250000, 500000]
  const finalNominal = nominal ?? Number(custom.replace(/\D/g, ''))

  async function startPayment() {
    if (finalNominal <= 0) return
    const uniqueAmount = finalNominal + Math.floor(Math.random() * 99) + 1
    try {
      const [row] = await api('payments', { method: 'POST', body: { kind: 'topup', amount: uniqueAmount, payload: { amount: finalNominal } } })
      setPayment({ id: Number(row.id), amount: uniqueAmount })
    } catch (e) { console.error(e) }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display font-800 text-2xl text-white pt-1">Top Up Saldo</h1>

      <div className="rounded-2xl px-4 py-4" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white" style={{ background: TONE.purple }}>
            <Icon name="wallet" size={26} />
          </div>
          <div>
            <p className="text-sm mb-1" style={{ color: '#8f9bbd' }}>Saldo Kamu</p>
            <p className="font-display font-800 text-2xl text-white">{formatRp(saldo)}</p>
            <p className="text-[10px] mt-1" style={{ color: '#8f9bbd' }}>Saldo bertambah setelah top up dikonfirmasi admin</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#8f9bbd' }}>Pilih Nominal</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {presets.map(n => (
            <button key={n} onClick={() => { setNominal(n); setCustom('') }}
              className="py-3 rounded-xl font-display font-700 text-xs transition-all"
              style={nominal === n
                ? { background: '#3d7ef5', color: '#fff' }
                : { background: '#0b0d18', color: '#8f9bbd', border: '1px solid #2a3154' }}>
              {formatRp(n)}
            </button>
          ))}
        </div>
        <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: '#8f9bbd' }}>Nominal Lainnya</label>
        <input value={custom} onChange={e => { setCustom(e.target.value); setNominal(null) }}
          placeholder="Rp 0"
          className="w-full text-white text-sm px-4 py-3 rounded-xl focus:outline-none transition-colors"
          style={{ background: '#0b0d18', border: '1px solid #2a3154', color: '#fff' }} />
      </div>

      <button onClick={startPayment} disabled={finalNominal <= 0}
        className="w-full font-display font-800 text-sm tracking-widest uppercase py-4 rounded-2xl transition hover:brightness-110 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: finalNominal > 0 ? '#3d7ef5' : '#232a48', color: finalNominal > 0 ? '#ffffff' : '#8f9bbd' }}>
        <Icon name="qr" size={18} /> Bayar via QRIS · {finalNominal > 0 ? formatRp(finalNominal) : '—'}
      </button>

      {payment && (
        <QRISModal total={payment.amount} paymentId={payment.id} onClose={() => setPayment(null)}
          onDone={() => { onPaid(); setPayment(null); setNominal(null); setCustom('') }} />
      )}

      <PaymentMethodsCard />
    </div>
  )
}

function PaymentMethodsCard() {
  return (
    <div className="rounded-2xl p-4" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
      <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#8f9bbd' }}>Metode Pembayaran Didukung</p>
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_LOGOS.map(p => (
          <div key={p.name} title={p.name}
            className="flex items-center justify-center h-12 rounded-xl px-3"
            style={{ background: '#0b0d18', border: '1px solid #2a3154' }}>
            <img src={p.src} alt={p.name} className="max-h-5 max-w-full object-contain" />
          </div>
        ))}
      </div>
      <p className="text-[10px] mt-3 leading-relaxed" style={{ color: '#8f9bbd' }}>Semua metode di atas diproses otomatis lewat QRIS — tinggal scan pakai e-wallet atau m-banking favoritmu.</p>
    </div>
  )
}

// ─── Checkout Page ────────────────────────────────────────────────────────────

function CheckoutPage({ cart, saldo, profile, onBack, onBoughtWithSaldo, onGoTopUp }: { cart: CartItem[]; saldo: number; profile: Row | null; onBack: () => void; onBoughtWithSaldo: () => void; onGoTopUp: () => void }) {
  const [buying, setBuying] = useState(false)
  const [err, setErr] = useState('')
  const total = cart.reduce((s, i) => s + i.product.price, 0)
  const cukup = saldo >= total

  async function buyWithSaldo() {
    setBuying(true); setErr('')
    try {
      await api('rpc/buy_with_saldo', { method: 'POST', body: { item_ids: cart.map(i => i.product.id) } })
      onBoughtWithSaldo()
    } catch (e) { setErr('Gagal memproses pembelian. Coba lagi.'); setBuying(false) }
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-3 pt-1">
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:text-white transition-colors" style={{ color: '#8f9bbd', background: '#171d36', border: '1px solid #2a3154' }} aria-label="Kembali"><Icon name="arrowLeft" size={18} /></button>
        <h1 className="font-display font-800 text-2xl text-white">Checkout</h1>
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        {cart.map(i => (
          <div key={i.product.id} className="flex items-center gap-3">
            <ProductThumb url={i.product.logoUrl} size={36} iconSize={18} />
            <div className="flex-1">
              <p className="font-display font-600 text-white text-xs">{i.product.name}</p>
              <p className="text-[10px]" style={{ color: '#8f9bbd' }}>{i.product.period}</p>
            </div>
            <p className="text-sm font-display font-800 text-white">{formatRp(i.product.price)}</p>
          </div>
        ))}
        <div className="flex justify-between items-center pt-3" style={{ borderTop: '1px solid #2a3154' }}>
          <span className="text-xs" style={{ color: '#8f9bbd' }}>Total</span>
          <span className="font-display font-800 text-white">{formatRp(total)}</span>
        </div>
      </div>

      {(profile?.contact_email || profile?.whatsapp) && (
        <div className="rounded-2xl p-3.5 flex items-start gap-2.5" style={{ background: '#0f1220', border: '1px solid #2a3154' }}>
          <span style={{ color: '#3d7ef5' }}><Icon name="check" size={15} strokeWidth={3} /></span>
          <p className="text-[11px] leading-relaxed" style={{ color: '#8f9bbd' }}>
            Data akun akan dikirim otomatis ke <span className="text-white font-display font-700">{profile?.contact_email || '-'}</span>
            {profile?.whatsapp && <> &amp; WA <span className="text-white font-display font-700">{profile.whatsapp}</span></>}.
            {' '}Bisa diubah di menu Pengaturan.
          </p>
        </div>
      )}

      {cukup ? (
        <>
          <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#0f3320', border: '1px solid #1d5a3a' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: TONE.green }}><Icon name="wallet" size={18} /></div>
            <div>
              <p className="font-display font-700 text-white text-sm">Dibayar pakai Saldo</p>
              <p className="text-[11px]" style={{ color: '#8f9bbd' }}>Saldo kamu {formatRp(saldo)} — cukup untuk pesanan ini</p>
            </div>
          </div>

          {err && <p className="text-[11px] text-center" style={{ color: '#f87171' }}>{err}</p>}

          <button onClick={buyWithSaldo} disabled={buying}
            className="w-full text-white font-display font-800 text-sm tracking-widest uppercase py-4 rounded-2xl hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: TONE.green }}>
            {buying ? 'Memproses...' : <>Beli Sekarang <Icon name="check" size={18} strokeWidth={3} /></>}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#3a1f12', border: '1px solid #6b3a1c' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: TONE.gold }}><Icon name="wallet" size={18} /></div>
            <div>
              <p className="font-display font-700 text-white text-sm">Saldo Anda tidak cukup</p>
              <p className="text-[11px]" style={{ color: '#c9a27a' }}>Silakan top up terlebih dahulu. Saldo kamu {formatRp(saldo)}, dibutuhkan {formatRp(total)}.</p>
            </div>
          </div>

          <button onClick={onGoTopUp}
            className="w-full text-white font-display font-800 text-sm tracking-widest uppercase py-4 rounded-2xl hover:brightness-110 transition flex items-center justify-center gap-2"
            style={{ background: TONE.gold }}>
            <Icon name="card" size={18} /> Top Up Saldo
          </button>
        </>
      )}
    </div>
  )
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

const MAX_AVATAR_MB = 10

function ProfilePage({ user, isAdmin, profile, onSaved }: { user: SessionUser; isAdmin: boolean; profile: Row | null; onSaved: (patch: Row) => void }) {
  const [name, setName] = useState(profile?.full_name ?? displayName(user))
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '')
  const [contactEmail, setContactEmail] = useState(profile?.contact_email ?? user.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try {
      await api(`profiles?id=eq.${user.id}`, { method: 'PATCH', body: { full_name: name.trim() || null, whatsapp: whatsapp.trim() || null, contact_email: contactEmail.trim() || null, avatar_url: avatarUrl || null } })
      onSaved({ full_name: name.trim(), whatsapp: whatsapp.trim(), contact_email: contactEmail.trim(), avatar_url: avatarUrl })
      setMsg('Pengaturan berhasil disimpan')
      setTimeout(() => setMsg(''), 3000)
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  async function pickAvatar(file: File) {
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) { setErr(`Ukuran foto maksimal ${MAX_AVATAR_MB} MB`); return }
    setUploading(true); setErr('')
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const url = await uploadFile('avatars', `${user.id}/${Date.now()}.${ext}`, file)
      setAvatarUrl(url)
    } catch (e) { setErr('Gagal unggah foto: ' + (e as Error).message) } finally { setUploading(false) }
  }

  const fakeUser: SessionUser = { ...user, user_metadata: { ...user.user_metadata, avatar_url: avatarUrl } }
  const field = 'w-full text-white text-sm px-4 py-3 rounded-xl focus:outline-none transition-colors'
  const fieldStyle = { background: '#0b0d18', border: '1px solid #2a3154' }

  return (
    <div className="space-y-3.5">
      <h1 className="font-display font-800 text-2xl text-white pt-1">Pengaturan</h1>

      {msg && <p className="text-xs rounded-xl p-3" style={{ background: '#0f3320', color: '#4ade80' }}>{msg}</p>}
      {err && <p className="text-xs rounded-xl p-3" style={{ background: '#3b1219', color: '#fca5a5' }}>{err}</p>}

      <div className="rounded-2xl p-5 flex flex-col items-center gap-3" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <Avatar user={fakeUser} size={80} />
        <label className="text-xs font-display font-700 cursor-pointer px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition hover:brightness-110" style={{ background: '#2657c9', color: '#fff' }}>
          <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
          <Icon name="image" size={14} /> {uploading ? 'Mengunggah...' : 'Ganti Foto Profil'}
        </label>
        {isAdmin && <span className="inline-flex items-center gap-1 mt-1 px-2.5 py-1 rounded-full text-[10px] font-display font-700 text-white" style={{ background: '#2657c9' }}><Icon name="shield" size={12} /> Admin</span>}
      </div>

      <div className="rounded-2xl p-4 space-y-3.5" style={{ background: '#171d36', border: '1px solid #2a3154' }}>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#8f9bbd' }}>Nama Lengkap</span>
          <input className={field} style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Nama kamu" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#8f9bbd' }}>Nomor WhatsApp</span>
          <input className={field} style={fieldStyle} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="mis. 6281234567890" inputMode="tel" />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: '#8f9bbd' }}>Email untuk Isi Otomatis Pembelian</span>
          <input className={field} style={fieldStyle} value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@contoh.com" type="email" />
          <span className="text-[10px] mt-1.5 block leading-relaxed" style={{ color: '#8f9bbd' }}>Email & nomor WhatsApp ini otomatis dipakai untuk mengisi data pembelian saat checkout.</span>
        </label>
        <div className="flex justify-between items-center pt-1" style={{ borderTop: '1px solid #2a3154' }}>
          <span className="text-xs pt-3" style={{ color: '#8f9bbd' }}>Login via Google · {user.email}</span>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full text-white font-display font-800 text-sm tracking-widest uppercase py-4 rounded-2xl hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: '#3d7ef5' }}>
        {saving ? 'Menyimpan...' : <><Icon name="check" size={18} strokeWidth={3} /> Simpan Pengaturan</>}
      </button>
    </div>
  )
}

// ─── Cart Bar ─────────────────────────────────────────────────────────────────

function CartBar({ cart, onCheckout }: { cart: CartItem[]; onCheckout: () => void }) {
  if (cart.length === 0) return null
  const total = cart.reduce((s, i) => s + i.product.price, 0)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 p-4" style={{ background: '#0b0d18', borderTop: '1px solid #2a3154', boxShadow: '0 -8px 24px #0b0d18' }}>
      <button onClick={onCheckout}
        className="w-full text-white font-display font-800 text-sm py-4 rounded-2xl flex items-center justify-between px-5 hover:brightness-110 transition"
        style={{ background: '#3d7ef5' }}>
        <span className="flex items-center gap-2"><Icon name="cart" size={18} /> {cart.length} item dipilih</span>
        <span>Checkout · {formatRp(total)}</span>
      </button>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────

type Page = 'dashboard' | 'produk' | 'pesanan' | 'saldo' | 'checkout' | 'profile' | 'admin'

const HISTORY_KEY = 'wt-nav'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [page, setPageState] = useState<Page>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [saldo, setSaldo] = useState(0)
  const [profile, setProfile] = useState<Row | null>(null)
  const [notice, setNotice] = useState('')
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)

  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL
  const fail = (e: unknown) => setNotice((e as Error).message)

  // Navigasi berbasis history API: setiap pindah halaman didorong ke riwayat browser
  // supaya tombol/gestur "kembali" berpindah antar-menu di dalam app, bukan keluar ke login.
  function navigate(p: string) {
    const next = p as Page
    setPageState(next)
    window.scrollTo(0, 0)
    if (history.state?.[HISTORY_KEY] !== next) history.pushState({ [HISTORY_KEY]: next }, '')
  }
  useEffect(() => {
    if (!history.state?.[HISTORY_KEY]) history.replaceState({ [HISTORY_KEY]: page }, '')
    const onPop = (e: PopStateEvent) => {
      const p = e.state?.[HISTORY_KEY] as Page | undefined
      setPageState(p ?? 'dashboard')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  async function loadProducts() {
    try {
      const rows = await api('products?select=*&active=eq.true&order=sort,id')
      setProducts(rows.map(rowToProduct))
    } catch (e) { fail(e) }
  }
  // Kategori 100% dari database (tabel `categories`), dikelola admin — dipakai
  // sebagai tab filter di halaman Produk supaya kategori baru langsung muncul.
  async function loadCategories() {
    try {
      const rows = await api('categories?select=*&order=sort,id')
      setCategories(rows.map((c: Row) => c.name))
    } catch (e) { fail(e) }
  }
  async function refreshCatalog() { await Promise.all([loadProducts(), loadCategories()]) }
  async function loadMine(uid: string) {
    try {
      const [o, p] = await Promise.all([api(`orders?select=*&user_id=eq.${uid}&order=id.desc`), api(`profiles?select=*&id=eq.${uid}`)])
      setOrders(o.map(rowToOrder)); setSaldo(Number(p[0]?.saldo ?? 0)); setProfile(p[0] ?? null); setNotice('')
    } catch (e) { fail(e) }
  }

  useEffect(() => {
    initSession().then(s => {
      setSession(s)
      if (s?.user.email?.toLowerCase() === ADMIN_EMAIL) setPageState('admin')
    }).finally(() => setBooting(false))
    refreshCatalog()
  }, [])
  useEffect(() => { if (session) loadMine(session.user.id) }, [session?.user.id])

  function addToCart(p: Product) {
    setCart(prev => prev.find(i => i.product.id === p.id) ? prev : [...prev, { product: p, qty: 1 }])
  }

  // Order/topup sudah ditulis backend (api/check-payment.js) begitu pembayaran GoBiz terdeteksi cocok —
  // di sini tinggal muat ulang data terbaru dari Supabase.
  async function handleCheckoutDone() {
    setCart([])
    try { await loadMine(session!.user.id) } catch (e) { fail(e) }
    navigate('dashboard')
  }

  async function handlePaid() {
    try { await loadMine(session!.user.id) } catch (e) { fail(e) }
  }

  async function logout() {
    await signOut()
    setSession(null); setOrders([]); setSaldo(0); setCart([]); setProfile(null); setPageState('dashboard')
  }

  if (booting) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: '#0b0d18', color: '#8f9bbd' }}>Memuat...</div>
  if (!session) return <LoginPage />

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: '#0b0d18' }}
      onClick={() => setDropdownOpen(false)}
    >
      <Header
        onMenuOpen={() => setSidebarOpen(true)}
        onProfileClick={e => { e.stopPropagation(); setDropdownOpen(d => !d) }}
        showDropdown={dropdownOpen}
        onSettingsClick={() => navigate('profile')}
        onProfileAction={a => {
          setDropdownOpen(false)
          if (a === 'My Profile' || a === 'Settings') navigate('profile')
          if (a === 'Logout') logout()
        }}
      />

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activePage={page}
        onNav={p => navigate(p)}
        user={session.user}
        profile={profile}
        isAdmin={isAdmin}
        onLogout={logout}
      />

      <main className="max-w-lg mx-auto px-4 pb-32" style={{ paddingTop: '72px' }}>
        {notice && <p className="text-xs rounded-xl p-3 mb-3" style={{ background: '#3b1219', color: '#fca5a5' }}>{notice}</p>}
        {page === 'dashboard' && <DashboardPage orders={orders} saldo={saldo} onNav={p => navigate(p)} onDetail={setDetailOrder} />}
        {page === 'produk'    && <ProdukPage cart={cart} onAdd={addToCart} products={products} categories={categories} />}
        {page === 'pesanan'   && <PesananPage orders={orders} onDetail={setDetailOrder} />}
        {page === 'saldo'     && <SaldoPage saldo={saldo} onPaid={handlePaid} />}
        {page === 'checkout'  && <CheckoutPage cart={cart} saldo={saldo} profile={profile} onBack={() => navigate('produk')}
          onBoughtWithSaldo={handleCheckoutDone} onGoTopUp={() => navigate('saldo')} />}
        {page === 'profile'   && <ProfilePage user={session.user} isAdmin={isAdmin} profile={profile} onSaved={patch => setProfile(pr => ({ ...(pr ?? {}), ...patch }))} />}
        {page === 'admin' && isAdmin && <AdminPage onChanged={refreshCatalog} />}
      </main>

      {page !== 'checkout' && <CartBar cart={cart} onCheckout={() => navigate('checkout')} />}
      <SupportButton />
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  )
}
