import { useRef, useState } from 'react'
import { Icon, formatRp, ProductThumb, PageHeader, EmptyState, SkeletonCard } from '../ui'
import { type Product, type CartItem } from '../types'

// ─── Product Card ─────────────────────────────────────────────────────────────

export function ProductCard({ p, onAdd, inCart }: { p: Product; onAdd: () => void; inCart: boolean }) {
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

export function ProdukPage({ cart, onAdd, products, categories, loading }: { cart: CartItem[]; onAdd: (p: Product) => void; products: Product[]; categories: string[]; loading?: boolean }) {
  const [tab, setTab] = useState('Semua')
  // Tab kategori diambil langsung dari kategori yang dibuat admin di database,
  // jadi kategori baru otomatis muncul di sini tanpa perlu ubah kode.
  const tabs = ['Semua', ...categories]
  const filtered = tab === 'Semua' ? products : products.filter(p => p.category === tab)
  const cartIds = new Set(cart.map(i => i.product.id))

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
    if (dx < 0 && idx < tabs.length - 1) setTab(tabs[idx + 1]) // geser ke kiri → kategori berikutnya
    else if (dx > 0 && idx > 0) setTab(tabs[idx - 1]) // geser ke kanan → kategori sebelumnya
  }

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

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{[0, 1, 2, 3].map(i => <SkeletonCard key={i} height={82} />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card"><EmptyState icon="package" title="Belum ada produk." description="Produk di kategori ini akan tampil di sini." /></div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
            {filtered.map(p => (
              <ProductCard key={p.id} p={p} onAdd={() => onAdd(p)} inCart={cartIds.has(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
