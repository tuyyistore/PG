import { useRef, useState } from 'react'
import { Icon, formatRp, ProductThumb, PageHeader, EmptyState, SkeletonCard } from '../ui'
import { type Product, type CartItem } from '../types'

// ─── Product Card ─────────────────────────────────────────────────────────────

export function ProductCard({ p, onAdd, inCart, expanded, onToggle }: { p: Product; onAdd: () => void; inCart: boolean; expanded: boolean; onToggle: () => void }) {
  const soldOut = p.available != null && p.available <= 0
  return (
    <div
      className="card card-float card-interactive overflow-hidden relative"
      style={p.popular ? { borderColor: 'rgba(79,124,255,0.35)', backgroundImage: 'linear-gradient(180deg, rgba(79,124,255,0.06) 0%, rgba(79,124,255,0) 60%)' } : undefined}
    >
      {p.popular && (
        <div
          className="absolute top-2.5 -right-7 w-28 rotate-45 text-center text-[10px] font-semibold tracking-wide text-white py-0.5 pointer-events-none select-none"
          style={{ background: 'linear-gradient(135deg, #4d8dff 0%, #2657c9 100%)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
        >
          TERLARIS
        </div>
      )}
      <button type="button" className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left" onClick={onToggle} aria-expanded={expanded}>
        <ProductThumb url={p.logoUrl} size={48} iconSize={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-semibold text-white tracking-tight">{p.name}</p>
            {p.badge && <span className={`badge ${p.popular ? 'badge-primary' : 'badge-neutral'}`}>{p.badge}</span>}
            {soldOut && <span className="badge badge-neutral">Stok habis</span>}
            {!soldOut && p.available != null && p.available <= 5 && <span className="badge badge-neutral">Sisa {p.available}</span>}
          </div>
          <p className="text-[13px] text-muted-foreground truncate mt-0.5">{p.tagline || p.category}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[15px] font-semibold text-white tabular">{formatRp(p.price)}</p>
          <p className="text-xs text-muted-foreground">{p.period}</p>
        </div>
        <Icon name="chevronDown" size={16} className={`text-muted-foreground transition-transform duration-200 hidden sm:block ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && <div className="ticket-divider" />}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-5 pt-4">
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
              disabled={inCart || soldOut}
              className={`btn btn-block ${inCart || soldOut ? '' : 'btn-primary btn-float'}`}
              style={inCart ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.2)', opacity: 1, cursor: 'default' } : undefined}
            >
              {inCart ? <><Icon name="check" size={16} strokeWidth={2.25} /> Ditambahkan</> : soldOut ? 'Stok habis' : <><Icon name="cart" size={16} /> Tambah ke Keranjang</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Produk Page ──────────────────────────────────────────────────────────────

export function ProdukPage({ cart, onAdd, products, categories, loading }: { cart: CartItem[]; onAdd: (p: Product) => void; products: Product[]; categories: string[]; loading?: boolean }) {
  const [tab, setTab] = useState('Semua')
  const [openId, setOpenId] = useState<Product['id'] | null>(null)
  const [q, setQ] = useState('')
  // Tab kategori diambil langsung dari kategori yang dibuat admin di database,
  // jadi kategori baru otomatis muncul di sini tanpa perlu ubah kode.
  const tabs = ['Semua', ...categories]
  const needle = q.trim().toLowerCase()
  const inTab = tab === 'Semua' ? products : products.filter(p => p.category === tab)
  const filtered = !needle ? inTab : inTab.filter(p => `${p.name} ${p.tagline} ${p.category} ${p.features.join(' ')}`.toLowerCase().includes(needle))
  const cartIds = new Set(cart.map(i => i.product.id))
  const countFor = (t: string) => t === 'Semua' ? products.length : products.filter(p => p.category === t).length

  // Geser kiri/kanan di area produk untuk pindah kategori, tanpa perlu menekan tab-nya.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return // abaikan geser vertikal/kecil
    const idx = tabs.indexOf(tab)
    if (dx < 0 && idx < tabs.length - 1) { setTab(tabs[idx + 1]); setOpenId(null) } // geser ke kiri → kategori berikutnya
    else if (dx > 0 && idx > 0) { setTab(tabs[idx - 1]); setOpenId(null) } // geser ke kanan → kategori sebelumnya
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Produk" subtitle="Pilih layanan yang ingin kamu beli." />
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-subtle"><Icon name="search" size={16} /></span>
        <input className="input" style={{ paddingLeft: 40 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk..." aria-label="Cari produk" />
      </div>
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {tabs.map(t => (
            <button key={t} onClick={() => { setTab(t); setOpenId(null) }} className={`chip ${tab === t ? 'chip-active' : ''}`}>
              {t} <span className="opacity-60">({countFor(t)})</span>
            </button>
          ))}
        </div>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <SkeletonCard key={i} height={82} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card"><EmptyState icon="package" title={needle ? 'Produk tidak ditemukan.' : 'Belum ada produk.'} description={needle ? 'Coba kata kunci lain.' : 'Produk di kategori ini akan tampil di sini.'} /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {filtered.map(p => (
              <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} inCart={cartIds.has(p.id)} expanded={openId === p.id} onToggle={() => setOpenId(id => id === p.id ? null : p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
