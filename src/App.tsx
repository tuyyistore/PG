import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ADMIN_EMAIL, api, initSession, signOut, type Row, type Session } from './lib/supabase'
import { Icon } from './ui'
import { useToast } from './feedback'
import { type Product, type CartItem, type Order } from './types'
import { rowToProduct, rowToOrder } from './lib/mappers'
import { BRAND_NAME } from './components/Brand'
import { OrderDetailModal } from './components/Orders'
import { Sidebar, PAGE_TITLES, Header, SupportButton, CartBar } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProdukPage } from './pages/ProdukPage'
import { PesananPage } from './pages/PesananPage'
import { SaldoPage } from './pages/SaldoPage'
import { CheckoutPage } from './pages/CheckoutPage'
import { ProfilePage } from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'

// ─── App Root ─────────────────────────────────────────────────────────────────

type Page = 'dashboard' | 'produk' | 'pesanan' | 'saldo' | 'checkout' | 'profile' | 'admin'

// Setiap halaman punya URL sendiri, jadi bisa di-refresh, dibagikan, dan tombol "kembali" browser
// berpindah antar-menu. vercel.json sudah me-rewrite semua path ke index.html.
const PATHS: Record<Page, string> = {
  dashboard: '/', produk: '/produk', pesanan: '/pesanan', saldo: '/topup',
  checkout: '/checkout', profile: '/pengaturan', admin: '/admin',
}
const pageFromPath = (path: string): Page | null => {
  const clean = path.replace(/\/+$/, '') || '/'
  return (Object.keys(PATHS) as Page[]).find(p => PATHS[p] === clean) ?? null
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const location = useLocation()
  const routerNavigate = useNavigate()
  const page: Page = pageFromPath(location.pathname) ?? 'dashboard'
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Kunci scroll halaman di belakang saat drawer mobile terbuka, supaya konten
  // di baliknya tidak ikut bergeser/tabrakan dengan drawer saat discroll.
  useEffect(() => {
    if (!sidebarOpen) return
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [sidebarOpen])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [saldo, setSaldo] = useState(0)
  const [profile, setProfile] = useState<Row | null>(null)
  const [notice, setNotice] = useState('')
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [mineLoaded, setMineLoaded] = useState(false)

  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL
  useEffect(() => { document.title = session ? `${PAGE_TITLES[page] ?? 'Dashboard'} · ${BRAND_NAME}` : `Masuk · ${BRAND_NAME}` }, [page, session])
  const fail = (e: unknown) => setNotice((e as Error).message)
  const toast = useToast()

  function navigate(p: string, opts?: { replace?: boolean }) {
    const next = PATHS[p as Page] ?? '/'
    if (next !== location.pathname) routerNavigate(next, opts)
    window.scrollTo(0, 0)
  }

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
  async function refreshCatalog() { await Promise.all([loadProducts(), loadCategories()]); setCatalogLoaded(true) }
  async function loadMine(uid: string) {
    try {
      const [o, p] = await Promise.all([api(`orders?select=*&user_id=eq.${uid}&order=id.desc`), api(`profiles?select=*&id=eq.${uid}`)])
      setOrders(o.map(rowToOrder)); setSaldo(Number(p[0]?.saldo ?? 0)); setProfile(p[0] ?? null); setNotice('')
    } catch (e) { fail(e) } finally { setMineLoaded(true) }
  }

  useEffect(() => {
    initSession().then(s => {
      setSession(s)
      // Admin langsung ke Dashboard Admin saat membuka halaman utama (perilaku lama dipertahankan).
      if (s?.user.email?.toLowerCase() === ADMIN_EMAIL && pageFromPath(location.pathname) === 'dashboard') navigate('admin', { replace: true })
    }).finally(() => setBooting(false))
    refreshCatalog()
  }, [])
  useEffect(() => { if (session) loadMine(session.user.id) }, [session?.user.id])

  // Jaga URL tetap valid: path tak dikenal / admin untuk non-admin → Dashboard,
  // checkout dengan keranjang kosong (mis. setelah refresh) → Produk.
  useEffect(() => {
    if (booting || !session) return
    const known = pageFromPath(location.pathname)
    if (!known || (known === 'admin' && !isAdmin)) navigate('dashboard', { replace: true })
    else if (known === 'checkout' && cart.length === 0) navigate('produk', { replace: true })
  }, [location.pathname, booting, session, isAdmin, cart.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function addToCart(p: Product) {
    setCart(prev => prev.find(i => i.product.id === p.id) ? prev : [...prev, { product: p, qty: 1 }])
    toast(`${p.name} ditambahkan ke keranjang`)
  }

  // Order/topup sudah ditulis backend (api/check-payment.js) begitu pembayaran GoBiz terdeteksi cocok —
  // di sini tinggal muat ulang data terbaru dari Supabase.
  async function handleCheckoutDone() {
    navigate('dashboard')
    setCart([])
    toast('Pembelian berhasil. Pesanan sudah aktif di Produk Saya.')
    try { await loadMine(session!.user.id) } catch (e) { fail(e) }
  }

  async function handlePaid() {
    try { await loadMine(session!.user.id) } catch (e) { fail(e) }
  }

  async function logout() {
    await signOut()
    setSession(null); setOrders([]); setSaldo(0); setCart([]); setProfile(null); navigate('dashboard', { replace: true })
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
        {page === 'dashboard' && <DashboardPage orders={orders} saldo={saldo} onNav={p => navigate(p)} onDetail={setDetailOrder} loading={!mineLoaded} />}
        {page === 'produk'    && <ProdukPage cart={cart} onAdd={addToCart} products={products} categories={categories} loading={!catalogLoaded} />}
        {page === 'pesanan'   && <PesananPage orders={orders} onDetail={setDetailOrder} loading={!mineLoaded} />}
        {page === 'saldo'     && <SaldoPage saldo={saldo} onPaid={handlePaid} userId={session.user.id} />}
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
