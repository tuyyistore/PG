import { Icon, formatRp, PageHeader, EmptyState, SkeletonRows } from '../ui'
import { type Order } from '../types'
import { StatCard, OrderRow } from '../components/Orders'
import { SpendingChart } from '../components/SpendingChart'

// ─── Dashboard Page ───────────────────────────────────────────────────────────

export function DashboardPage({ orders, saldo, onNav, onDetail, loading }: { orders: Order[]; saldo: number; onNav: (p: string) => void; onDetail: (o: Order) => void; loading?: boolean }) {
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
            {loading ? <div className="skeleton h-9 w-48 rounded-lg mt-1" /> : <p className="text-[28px] sm:text-[32px] leading-tight font-semibold text-white tracking-tight tabular truncate">{formatRp(saldo)}</p>}
          </div>
        </div>
        <button onClick={() => onNav('saldo')} className="btn btn-secondary hidden sm:inline-flex sm:self-center">
          Isi saldo <Icon name="arrowUpRight" size={15} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard icon="circleCheck" tone="success" label="Total Produk Dibeli" loading={loading} value={String(dibeli)} />
        <StatCard icon="clock" tone="warning" label="Total Produk Pending" loading={loading} value={String(pendingOrders)} />
        <StatCard icon="circleX" tone="danger" label="Total Produk Dibatalkan" loading={loading} value={String(dibatalkan)} />
      </div>

      <SpendingChart orders={orders} loading={loading} />

      {/* Produk Saya */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Produk Saya</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{loading ? 'Memuat…' : `${orders.length} pesanan`}</p>
          </div>
          <button onClick={() => onNav('pesanan')} className="btn btn-ghost btn-sm -mr-2">
            Lihat Semua <Icon name="chevronRight" size={14} />
          </button>
        </div>

        {loading ? <SkeletonRows rows={3} /> : orders.length === 0 ? (
          <EmptyState icon="package" description="Produk yang kamu beli akan muncul di sini."
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
