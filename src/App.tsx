import { useEffect, useState } from 'react'
import { ADMIN_EMAIL, api, configured, displayName, initSession, signInWithGoogle, signOut, uploadFile, type Row, type Session, type SessionUser } from './lib/supabase'
import { Icon, TONE, formatRp, ProductThumb, PageHeader, EmptyState, StatusBadge, type IconName } from './ui'
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

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Semua token warna/spacing/radius didefinisikan di src/index.css (:root + @theme)
// dan dipakai lewat kelas komponen (.card, .btn, .input, .badge, dst).


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
            <p className="eyebrow">Total pembayaran (nominal unik)</p>
            <p className="text-[28px] leading-9 font-semibold text-white tracking-tight tabular mt-1">{formatRp(total)}</p>
          </div>

          <div className="bg-white rounded-2xl p-5 flex flex-col items-center justify-center min-h-[232px]">
            {qrUrl ? (
              <img src={qrUrl} alt="QRIS" width={196} height={196} className="rounded-md" />
            ) : (
              <p className="text-xs text-center px-4 text-slate-500">QRIS statis belum diatur (VITE_QRIS_STATIC_STRING).</p>
            )}
            <img src={logoQris} alt="QRIS" className="h-4 mt-4 object-contain" />
          </div>

          <div className="alert alert-warning">
            <Icon name="info" size={16} className="mt-0.5" />
            <span>Bayar persis sesuai nominal ini ya, termasuk 2 digit terakhir.</span>
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

// ─── Brand ────────────────────────────────────────────────────────────────────

// Ganti nama brand di sini bila perlu.
const BRAND_NAME = 'panelbot'

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center justify-center text-white font-bold tracking-tight" style={{ width: size, height: size, borderRadius: 8, background: '#4f7cff', fontSize: size * 0.46 }}>
        pb
      </div>
      <span className="text-[15px] font-semibold text-white tracking-tight">{BRAND_NAME}</span>
    </div>
  )
}

// ─── Auth UI & mapper data ────────────────────────────────────────────────────

function Avatar({ user, size }: { user: SessionUser; size: number }) {
  const url = user.user_metadata?.avatar_url || user.user_metadata?.picture
  return url
    ? <img src={url} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }} />
    : <div className="rounded-full flex items-center justify-center font-semibold text-slate-200 flex-shrink-0" style={{ width: size, height: size, background: '#26314b', fontSize: size * 0.4, boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>{displayName(user).charAt(0).toUpperCase()}</div>
}

function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8"><BrandMark size={32} /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white tracking-tight">Masuk ke akun</h1>
          <p className="hint mt-2 mb-6">Lanjutkan dengan akun Google. Admin masuk dengan email Google yang terdaftar sebagai admin.</p>
          <button onClick={signInWithGoogle} disabled={!configured}
            className="btn btn-lg btn-block"
            style={{ background: configured ? '#ffffff' : '#1f2940', color: configured ? '#0f172a' : '#94a3b8', opacity: 1 }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
            Lanjutkan dengan Google
          </button>
          {!configured && <div className="alert alert-warning mt-4"><Icon name="info" size={16} className="mt-0.5" /><span>Database belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Environment Variables Vercel.</span></div>}
        </div>
        <p className="hint text-center mt-6 flex items-center justify-center gap-1.5"><Icon name="lock" size={13} /> Login aman melalui Google OAuth</p>
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
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <ProductThumb url={order.product.logoUrl} size={40} iconSize={18} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{order.product.name}</p>
              <p className="text-xs text-muted-foreground tabular">{order.id} · {order.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm flex-shrink-0" aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>
        <div className="p-5">
          <p className="label">Data akun / informasi penting</p>
          <div className="card-inset p-4">
            {order.accountData ? (
              <p className="text-[13px] text-slate-100 whitespace-pre-wrap leading-relaxed font-mono break-words">{order.accountData}</p>
            ) : (
              <p className="hint">Belum ada data yang dikirim admin untuk pesanan ini. Silakan hubungi support jika perlu.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

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
      {open && <div className="fixed inset-0 z-30 bg-[#050810]/70 backdrop-blur-[2px] lg:hidden" style={{ animation: 'fade-in 200ms' }} onClick={onClose} />}
      <aside
        className={`fixed top-0 left-0 h-full w-[264px] lg:w-64 z-40 flex flex-col bg-sidebar transition-transform duration-200 ease-out lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="h-16 flex items-center justify-between px-5">
          <BrandMark />
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm lg:hidden" aria-label="Tutup menu"><Icon name="x" size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <p className="px-3 pb-2 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Menu</p>
          <div className="space-y-1">
            {items.map(item => {
              const active = activePage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => { onNav(item.id); onClose() }}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          <p className="px-3 pb-2 pt-6 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Akun</p>
          <div className="space-y-1">
            <button onClick={() => { onNav('profile'); onClose() }} className={`nav-item ${activePage === 'profile' ? 'nav-item-active' : ''}`}>
              <Icon name="settings" size={18} /><span>Pengaturan</span>
            </button>
          </div>
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl">
            <Avatar user={shownUser} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{shownName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={onLogout} className="nav-item mt-1 hover:!text-[#f87171]">
            <Icon name="logout" size={18} /><span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', produk: 'Produk', pesanan: 'Pesanan Saya', saldo: 'Top Up Saldo',
  checkout: 'Checkout', profile: 'Pengaturan', admin: 'Dashboard Admin',
}

function Header({ onMenuOpen, onProfileClick, showDropdown, onProfileAction, onSettingsClick, user, profile, page }: {
  onMenuOpen: () => void
  onProfileClick: (e: React.MouseEvent) => void
  showDropdown: boolean
  onProfileAction: (a: string) => void
  onSettingsClick: () => void
  user: SessionUser
  profile: Row | null
  page: string
}) {
  const shownUser: SessionUser = profile?.avatar_url ? { ...user, user_metadata: { ...user.user_metadata, avatar_url: profile.avatar_url } } : user
  const shownName = profile?.full_name || displayName(user)
  const menu: { action: string; label: string; icon: IconName }[] = [
    { action: 'My Profile', label: 'Profil Saya', icon: 'user' },
    { action: 'Settings', label: 'Pengaturan', icon: 'settings' },
    { action: 'Logout', label: 'Logout', icon: 'logout' },
  ]

  return (
    <header
      className="fixed top-0 left-0 right-0 lg:left-64 z-20 h-16 flex items-center px-4 sm:px-6 lg:px-8 justify-between bg-background/85 backdrop-blur-md"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuOpen} className="btn btn-ghost btn-icon -ml-2 lg:hidden" aria-label="Buka menu">
          <Icon name="menu" size={20} />
        </button>
        <div className="lg:hidden"><BrandMark size={26} /></div>
        <div className="hidden lg:flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Workspace</span>
          <Icon name="chevronRight" size={14} className="text-subtle" />
          <span className="text-white font-medium">{PAGE_TITLES[page] ?? 'Dashboard'}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={onSettingsClick} aria-label="Pengaturan" className="btn btn-ghost btn-icon">
          <Icon name="settings" size={18} />
        </button>

        <div className="relative">
          <button onClick={onProfileClick} className="flex items-center gap-2 h-10 pl-1 pr-1 sm:pr-2.5 rounded-[14px] transition-colors duration-200 hover:bg-white/[0.04]" aria-haspopup="menu" aria-expanded={showDropdown}>
            <span className="relative">
              <Avatar user={shownUser} size={30} />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e', border: '2px solid #0b1220' }} />
            </span>
            <span className="hidden sm:block text-sm font-medium text-white max-w-[140px] truncate">{shownName}</span>
            <Icon name="chevronDown" size={14} className="hidden sm:block text-muted-foreground" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-12 w-56 rounded-2xl p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]" role="menu"
              style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.08)', animation: 'dialog-in 200ms' }}
              onClick={e => e.stopPropagation()}>
              <div className="px-3 py-2.5 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-sm font-medium text-white truncate">{shownName}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              {menu.map(m => (
                <button key={m.action} onClick={() => onProfileAction(m.action)} role="menuitem"
                  className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-[10px] text-sm text-left transition-colors duration-200 ${m.action === 'Logout' ? 'text-[#f87171] hover:bg-[#ef4444]/10' : 'text-slate-200 hover:bg-white/[0.05] hover:text-white'}`}>
                  <Icon name={m.icon} size={16} /> {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

// ─── Stat Card — compact horizontal, monochrome icon ──────────────────────────

function StatCard({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: 'success' | 'warning' | 'danger' }) {
  const dot = { success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' }[tone]
  return (
    <div className="card card-interactive flex items-center gap-4 px-4 py-4 sm:px-5">
      <div className="icon-tile"><Icon name={icon} size={18} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted-foreground flex items-center gap-2 truncate">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />{label}
        </p>
        <p className="text-xl font-semibold text-white tracking-tight tabular mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── Order row (dipakai Dashboard & Pesanan) ──────────────────────────────────

function OrderRow({ o, onDetail, showMeta }: { o: Order; onDetail: (o: Order) => void; showMeta?: boolean }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition-colors duration-200 hover:bg-white/[0.02]">
      <ProductThumb url={o.product.logoUrl} size={40} iconSize={18} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{o.product.name}</p>
        <p className="text-xs text-muted-foreground tabular truncate mt-0.5">{o.id} · {o.date}{showMeta && o.product.category && <span className="hidden sm:inline"> · {o.product.category}</span>}</p>
      </div>
      {showMeta && (
        <p className="hidden sm:block text-sm font-medium text-white tabular whitespace-nowrap">
          {formatRp(o.product.price)}<span className="text-muted-foreground font-normal">{o.product.period}</span>
        </p>
      )}
      <div className="hidden md:block w-24 text-right"><StatusBadge status={o.status} /></div>
      {o.status === 'aktif' ? (
        <button onClick={() => onDetail(o)} className="btn btn-secondary btn-sm flex-shrink-0">
          <Icon name="eye" size={14} /> <span><span className="hidden sm:inline">Lihat </span>Detail</span>
        </button>
      ) : (
        <span className="md:hidden flex-shrink-0"><StatusBadge status={o.status} /></span>
      )}
    </div>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

function DashboardPage({ orders, saldo, onNav, onDetail }: { orders: Order[]; saldo: number; onNav: (p: string) => void; onDetail: (o: Order) => void }) {
  const dibeli = orders.filter(o => o.status === 'aktif').length
  const pendingOrders = orders.filter(o => o.status === 'pending').length
  const dibatalkan = orders.filter(o => o.status === 'nonaktif').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan saldo dan aktivitas pembelianmu."
        actions={
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto">
            <button onClick={() => onNav('saldo')} className="btn btn-secondary"><Icon name="wallet" size={16} /> Top Up</button>
            <button onClick={() => onNav('produk')} className="btn btn-primary"><Icon name="plus" size={16} strokeWidth={2} /> Beli Produk</button>
          </div>
        }
      />

      {/* Balance */}
      <div className="card p-5 sm:p-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="icon-tile" style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name="wallet" size={20} /></div>
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Saldo tersedia</p>
            <p className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight tabular truncate">{formatRp(saldo)}</p>
          </div>
        </div>
        <button onClick={() => onNav('saldo')} className="btn btn-secondary hidden sm:inline-flex sm:self-center">
          Isi saldo <Icon name="arrowUpRight" size={15} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon="circleCheck" tone="success" label="Total Produk Dibeli" value={String(dibeli)} />
        <StatCard icon="clock" tone="warning" label="Total Produk Pending" value={String(pendingOrders)} />
        <StatCard icon="circleX" tone="danger" label="Total Produk Dibatalkan" value={String(dibatalkan)} />
      </div>

      {/* Produk Saya */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Produk Saya</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{orders.length} pesanan</p>
          </div>
          <button onClick={() => onNav('pesanan')} className="btn btn-ghost btn-sm -mr-2">
            Lihat Semua <Icon name="chevronRight" size={14} />
          </button>
        </div>

        {orders.length === 0 ? (
          <EmptyState icon="server" title="Belum ada server untuk ditampilkan" description="Produk yang kamu beli akan muncul di sini."
            action={<button onClick={() => onNav('produk')} className="btn btn-primary btn-sm"><Icon name="plus" size={14} /> Beli Produk</button>} />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {orders.map(o => <OrderRow key={o.id} o={o} onDetail={onDetail} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Support Button (buka live chat Chaport) ──────────────────────────────────

function SupportButton({ raised }: { raised?: boolean }) {
  const openChat = () => {
    const w = window as unknown as { chaport?: { q: (...args: unknown[]) => void } }
    w.chaport?.q('open')
  }
  return (
    <button
      onClick={openChat}
      aria-label="Live Chat Support"
      title="Live Chat Support"
      className={`fixed right-4 sm:right-6 z-[25] w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:bg-[#5e89ff] active:scale-95 ${raised ? 'bottom-28' : 'bottom-6'}`}
      style={{ background: '#4f7cff', boxShadow: '0 8px 20px -6px rgba(0,0,0,0.5)' }}
    >
      <Icon name="headset" size={20} />
    </button>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ p, onAdd, inCart }: { p: Product; onAdd: () => void; inCart: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="card card-interactive overflow-hidden"
      style={p.popular ? { borderColor: 'rgba(79,124,255,0.35)' } : undefined}
    >
      <button type="button" className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
        <ProductThumb url={p.logoUrl} size={48} iconSize={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-semibold text-white tracking-tight">{p.name}</p>
            {p.badge && <span className={`badge ${p.popular ? 'badge-primary' : 'badge-neutral'}`}>{p.badge}</span>}
          </div>
          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{p.tagline || p.category}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[15px] font-semibold text-white tabular">{formatRp(p.price)}</p>
          <p className="text-xs text-muted-foreground">{p.period}</p>
        </div>
        <Icon name="chevronDown" size={16} className={`text-muted-foreground transition-transform duration-200 hidden sm:block ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 pt-4 page-enter" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {p.features.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 mb-4">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-[13px] text-slate-300">
                  <Icon name="check" size={14} strokeWidth={2.25} className="text-[#8fb0ff]" />{f}
                </li>
              ))}
            </ul>
          )}
          {p.originalPrice && (
            <p className="text-xs text-muted-foreground mb-2">
              Harga normal <span className="line-through tabular">{formatRp(p.originalPrice)}{p.period}</span>
            </p>
          )}
          <button
            onClick={onAdd}
            disabled={inCart}
            className={`btn btn-block ${inCart ? '' : 'btn-primary'}`}
            style={inCart ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.2)', opacity: 1, cursor: 'default' } : undefined}
          >
            {inCart ? <><Icon name="check" size={16} strokeWidth={2.25} /> Ditambahkan</> : <><Icon name="cart" size={16} /> Tambah ke Keranjang</>}
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
    <div className="space-y-6">
      <PageHeader title="Produk" subtitle="Pilih layanan yang ingin kamu beli." />
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`chip ${tab === t ? 'chip-active' : ''}`}>{t}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="card"><EmptyState icon="package" title="Belum ada produk." description="Produk di kategori ini akan tampil di sini." /></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
          {filtered.map(p => (
            <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} inCart={cartIds.has(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Pesanan Page ─────────────────────────────────────────────────────────────

function PesananPage({ orders, onDetail }: { orders: Order[]; onDetail: (o: Order) => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Pesanan Saya" subtitle="Riwayat semua pesanan dan status layananmu." />
      <div className="card overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState icon="clipboard" title="Belum ada pesanan untuk ditampilkan" description="Pesanan yang kamu buat akan muncul di sini." />
        ) : (
          <>
            <div className="px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="section-title">Semua pesanan</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{orders.length} pesanan</p>
            </div>
            <div className="divide-y divide-white/[0.06]">
              {orders.map(o => (
                <div key={o.id}>
                  <OrderRow o={o} onDetail={onDetail} showMeta />
                  <div className="sm:hidden flex justify-between items-center px-4 pb-3.5 -mt-1 pl-[68px]">
                    <span className="text-xs text-muted-foreground">{o.product.category}</span>
                    <span className="text-sm font-medium text-white tabular">{formatRp(o.product.price)}<span className="text-xs text-muted-foreground font-normal">{o.product.period}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
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
          <button onClick={startPayment} disabled={finalNominal <= 0} className="btn btn-primary btn-lg btn-block">
            <Icon name="qr" size={18} /> Bayar via QRIS · {finalNominal > 0 ? formatRp(finalNominal) : '—'}
          </button>
          <p className="hint mt-3 text-center">Nominal unik ditambahkan otomatis. Saldo bertambah setelah top up dikonfirmasi.</p>
        </div>
      </div>

      {payment && (
        <QRISModal total={payment.amount} paymentId={payment.id} onClose={() => setPayment(null)}
          onDone={() => { onPaid(); setPayment(null); setNominal(null); setCustom('') }} />
      )}
    </div>
  )
}

function PaymentMethodsCard() {
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
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal ({cart.length} item)</dt><dd className="text-white tabular">{formatRp(total)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Saldo kamu</dt><dd className="text-white tabular">{formatRp(saldo)}</dd></div>
          </dl>
          <div className="divider" />
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

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Pengaturan" subtitle="Kelola profil dan data kontak untuk pembelian." />

      {msg && <div className="alert alert-success"><Icon name="circleCheck" size={16} className="mt-0.5" /><span>{msg}</span></div>}
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

      {/* Profile section */}
      <section className="card">
        <div className="px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="section-title">Profil</h2>
          <p className="hint mt-1">Foto dan nama yang ditampilkan di akunmu.</p>
        </div>
        <div className="px-5 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar user={fakeUser} size={72} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-semibold text-white truncate">{name || displayName(user)}</p>
              {isAdmin && <span className="badge badge-primary"><Icon name="shield" size={12} /> Admin</span>}
            </div>
            <p className="text-[13px] text-muted-foreground truncate">{user.email}</p>
            <p className="hint mt-1">JPG, PNG atau GIF. Maksimal {MAX_AVATAR_MB} MB.</p>
          </div>
          <label className={`btn btn-secondary cursor-pointer self-start sm:self-center ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
            {uploading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Icon name="upload" size={16} />}
            {uploading ? 'Mengunggah...' : 'Ganti Foto Profil'}
          </label>
        </div>
        <div className="px-5 sm:px-6 pb-6">
          <label className="block max-w-md">
            <span className="label">Nama lengkap</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nama kamu" />
          </label>
        </div>
      </section>

      {/* Contact section */}
      <section className="card">
        <div className="px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="section-title">Kontak pembelian</h2>
          <p className="hint mt-1">Email &amp; nomor WhatsApp ini otomatis dipakai untuk mengisi data pembelian saat checkout.</p>
        </div>
        <div className="px-5 sm:px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <label className="block">
            <span className="label">Nomor WhatsApp</span>
            <input className="input" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="mis. 6281234567890" inputMode="tel" />
          </label>
          <label className="block">
            <span className="label">Email untuk isi otomatis pembelian</span>
            <input className="input" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@contoh.com" type="email" />
          </label>
        </div>
        <div className="px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', borderRadius: '0 0 16px 16px' }}>
          <span className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0"><Icon name="lock" size={13} /> <span className="truncate">Login via Google · {user.email}</span></span>
          <button onClick={save} disabled={saving} className="btn btn-primary w-full sm:w-auto">
            {saving ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</> : <><Icon name="check" size={16} strokeWidth={2.25} /> Simpan Pengaturan</>}
          </button>
        </div>
      </section>
    </div>
  )
}

// ─── Cart Bar ─────────────────────────────────────────────────────────────────

function CartBar({ cart, onCheckout }: { cart: CartItem[]; onCheckout: () => void }) {
  if (cart.length === 0) return null
  const total = cart.reduce((s, i) => s + i.product.price, 0)
  return (
    <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-20 px-4 pb-4 pt-3 sm:px-6 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/95 to-transparent">
      <div className="max-w-5xl mx-auto card flex items-center gap-3 p-2 pl-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]" style={{ borderColor: 'rgba(255,255,255,0.08)', animation: 'dialog-in 200ms' }}>
        <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="cart" size={16} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{cart.length} item dipilih</p>
          <p className="text-xs text-muted-foreground tabular">{formatRp(total)}</p>
        </div>
        <button onClick={onCheckout} className="btn btn-primary">
          Checkout <span className="hidden sm:inline tabular">· {formatRp(total)}</span> <Icon name="chevronRight" size={16} />
        </button>
      </div>
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

  if (booting) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
      <span className="w-5 h-5 rounded-full border-2 border-slate-700 border-t-[#4f7cff] animate-spin" />
      Memuat...
    </div>
  )
  if (!session) return <LoginPage />

  return (
    <div
      className="min-h-screen text-white bg-background"
      onClick={() => setDropdownOpen(false)}
    >
      <Header
        onMenuOpen={() => setSidebarOpen(true)}
        onProfileClick={e => { e.stopPropagation(); setDropdownOpen(d => !d) }}
        showDropdown={dropdownOpen}
        onSettingsClick={() => navigate('profile')}
        user={session.user}
        profile={profile}
        page={page}
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

      <main className="lg:pl-64 pt-16">
        <div key={page} className={`page-enter max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 ${cart.length > 0 && page !== 'checkout' ? 'pb-36' : 'pb-24'}`}>
        {notice && <div className="alert alert-danger mb-6"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{notice}</span></div>}
        {page === 'dashboard' && <DashboardPage orders={orders} saldo={saldo} onNav={p => navigate(p)} onDetail={setDetailOrder} />}
        {page === 'produk'    && <ProdukPage cart={cart} onAdd={addToCart} products={products} categories={categories} />}
        {page === 'pesanan'   && <PesananPage orders={orders} onDetail={setDetailOrder} />}
        {page === 'saldo'     && <SaldoPage saldo={saldo} onPaid={handlePaid} />}
        {page === 'checkout'  && <CheckoutPage cart={cart} saldo={saldo} profile={profile} onBack={() => navigate('produk')}
          onBoughtWithSaldo={handleCheckoutDone} onGoTopUp={() => navigate('saldo')} />}
        {page === 'profile'   && <ProfilePage user={session.user} isAdmin={isAdmin} profile={profile} onSaved={patch => setProfile(pr => ({ ...(pr ?? {}), ...patch }))} />}
        {page === 'admin' && isAdmin && <AdminPage onChanged={refreshCatalog} />}
        </div>
      </main>

      {page !== 'checkout' && <CartBar cart={cart} onCheckout={() => navigate('checkout')} />}
      <SupportButton raised={cart.length > 0 && page !== 'checkout'} />
      {detailOrder && <OrderDetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  )
}
