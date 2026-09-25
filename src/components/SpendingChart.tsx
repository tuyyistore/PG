import { formatRp } from '../ui'
import { type Order } from '../types'

// Grafik batang total belanja per bulan (6 bulan terakhir), dihitung dari pesanan milik user.
export function SpendingChart({ orders, loading }: { orders: Order[]; loading?: boolean }) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('id-ID', { month: 'short' }), total: 0, count: 0 }
  })
  for (const o of orders) {
    const d = new Date(o.createdAt)
    const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`)
    if (m) { m.total += o.product.price; m.count++ }
  }
  const max = Math.max(...months.map(m => m.total), 1)
  const sum = months.reduce((a, m) => a + m.total, 0)
  const current = months[5]

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="section-title">Pengeluaran</h2>
          <p className="text-xs text-muted-foreground mt-0.5">6 bulan terakhir</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-muted-foreground">Bulan ini</p>
            {loading ? <div className="skeleton h-5 w-20 rounded-md mt-1 ml-auto" /> : <p className="text-[15px] font-semibold text-white tabular">{formatRp(current.total)}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total 6 bulan</p>
            {loading ? <div className="skeleton h-5 w-24 rounded-md mt-1 ml-auto" /> : <p className="text-[15px] font-semibold text-white tabular">{formatRp(sum)}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-36" role="img"
        aria-label={`Pengeluaran 6 bulan terakhir: ${months.map(m => `${m.label} ${formatRp(m.total)}`).join(', ')}`}>
        {months.map((m, i) => {
          const h = loading ? 20 + ((i * 37) % 60) : m.total ? Math.max(6, (m.total / max) * 100) : 0
          return (
            <div key={m.key} className="group relative flex flex-col items-center justify-end h-full">
              {!loading && m.total > 0 && (
                <div className="pointer-events-none absolute -top-1 -translate-y-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] text-white tabular z-10"
                  style={{ background: '#26314b', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {formatRp(m.total)} · {m.count} pesanan
                </div>
              )}
              <div className={`w-full max-w-[44px] rounded-lg transition-all duration-200 ${loading ? 'skeleton' : ''}`}
                style={loading ? { height: `${h}%` } : { height: m.total ? `${h}%` : 2, background: i === 5 ? '#4f7cff' : 'rgba(79,124,255,0.35)' }} />
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-6 gap-2 sm:gap-4 mt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
        {months.map((m, i) => <span key={m.key} className={`text-center text-xs capitalize ${i === 5 ? 'text-white font-medium' : 'text-muted-foreground'}`}>{m.label}</span>)}
      </div>
      {!loading && sum === 0 && <p className="hint text-center mt-4">Belum ada pembelian dalam 6 bulan terakhir.</p>}
    </div>
  )
}
