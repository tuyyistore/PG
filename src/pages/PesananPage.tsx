import { useState } from 'react'
import { Icon, formatRp, PageHeader, EmptyState, SkeletonRows, PullToRefresh } from '../ui'
import { type Order } from '../types'
import { OrderRow } from '../components/Orders'

// ─── Pesanan Page ─────────────────────────────────────────────────────────────

export const ORDER_FILTERS: { id: 'semua' | Order['status']; label: string }[] = [
  { id: 'semua', label: 'Semua' }, { id: 'aktif', label: 'Aktif' }, { id: 'pending', label: 'Pending' }, { id: 'nonaktif', label: 'Nonaktif' },
]

export function PesananPage({ orders, onDetail, loading, onRefresh }: { orders: Order[]; onDetail: (o: Order) => void; loading?: boolean; onRefresh?: () => Promise<void> | void }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<(typeof ORDER_FILTERS)[number]['id']>('semua')
  const query = q.trim().toLowerCase()
  const filtered = orders.filter(o =>
    (status === 'semua' || o.status === status) &&
    (!query || o.id.toLowerCase().includes(query) || o.product.name.toLowerCase().includes(query) || (o.product.category ?? '').toLowerCase().includes(query))
  )
  const count = (id: string) => id === 'semua' ? orders.length : orders.filter(o => o.status === id).length

  const body = (
    <div className="space-y-6">
      <PageHeader title="Pesanan Saya" subtitle="Riwayat semua pesanan dan status layananmu." />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            {ORDER_FILTERS.map(f => (
              <button key={f.id} onClick={() => setStatus(f.id)} className={`chip gap-2 ${status === f.id ? 'chip-active' : ''}`}>
                {f.label}<span className="text-[11px] tabular text-subtle">{count(f.id)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="relative sm:w-72">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"><Icon name="search" size={16} /></span>
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Cari ID atau nama produk" value={q} onChange={e => setQ(e.target.value)} aria-label="Cari pesanan" />
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? <SkeletonRows rows={4} /> : orders.length === 0 ? (
          <EmptyState icon="clipboard" title="Belum ada pesanan untuk ditampilkan" description="Pesanan yang kamu buat akan muncul di sini." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search" title="Tidak ada pesanan yang cocok" description="Coba kata kunci atau filter status lain."
            action={<button onClick={() => { setQ(''); setStatus('semua') }} className="btn btn-secondary btn-sm">Reset filter</button>} />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filtered.map(o => (
              <div key={o.id}>
                <OrderRow o={o} onDetail={onDetail} showMeta />
                <div className="sm:hidden flex justify-between items-center px-4 pb-3.5 -mt-1 pl-[68px]">
                  <span className="text-xs text-muted-foreground">{o.product.category}</span>
                  <span className="text-sm font-medium text-white tabular">{formatRp(o.product.price)}<span className="text-xs text-muted-foreground font-normal">{o.product.period}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
  return onRefresh ? <PullToRefresh onRefresh={onRefresh}>{body}</PullToRefresh> : body
}
