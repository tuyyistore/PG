import { Icon, formatRp, ProductThumb, StatusBadge, type IconName } from '../ui'
import { type Order } from '../types'

// ─── Detail Pesanan Modal (data akun/info penting yang dikirim admin) ─────────

export function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
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


// ─── Stat Card — compact horizontal, monochrome icon ──────────────────────────

export function StatCard({ icon, label, value, tone, loading }: { icon: IconName; label: string; value: string; tone: 'success' | 'warning' | 'danger'; loading?: boolean }) {
  const dot = { success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' }[tone]
  return (
    <div className="card card-interactive flex items-center gap-4 px-4 py-4 sm:px-5">
      <div className="icon-tile"><Icon name={icon} size={18} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted-foreground flex items-center gap-2 truncate">
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />{label}
        </p>
        {loading ? <div className="skeleton h-6 w-10 rounded-md mt-1" /> : <p className="text-xl font-semibold text-white tracking-tight tabular mt-0.5">{value}</p>}
      </div>
    </div>
  )
}

// ─── Order row (dipakai Dashboard & Pesanan) ──────────────────────────────────

export function OrderRow({ o, onDetail, showMeta }: { o: Order; onDetail: (o: Order) => void; showMeta?: boolean }) {
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
