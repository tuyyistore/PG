import { useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, PageHeader, EmptyState, StatusBadge, SkeletonRows } from '../ui'

// ─── Saldo Page ───────────────────────────────────────────────────────────────

export function SaldoPage({ saldo, userId }: { saldo: number; userId: string }) {
  const [history, setHistory] = useState<Row[] | null>(null)
  const loadHistory = () => api(`topups?select=id,amount,status,created_at&user_id=eq.${userId}&order=id.desc&limit=10`).then(setHistory).catch(() => setHistory([]))
  useEffect(() => { loadHistory() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageHeader title="Saldo" subtitle="Saldo dan riwayat top up akunmu." />

      <div className="card p-5 sm:p-6 space-y-4">
        <div className="card-inset p-4">
          <p className="text-xs text-muted-foreground">Saldo kamu</p>
          <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(saldo)}</p>
        </div>
        <div className="alert alert-warning"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>Top up otomatis sedang tidak tersedia. Hubungi admin untuk menambah saldo.</span></div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Riwayat top up</h2>
            <p className="text-xs text-muted-foreground mt-0.5">10 transaksi terakhir</p>
          </div>
          <button onClick={loadHistory} className="btn btn-ghost btn-icon btn-sm -mr-2" aria-label="Muat ulang riwayat"><Icon name="refresh" size={16} /></button>
        </div>
        {history === null ? <SkeletonRows rows={2} thumb={36} /> : history.length === 0 ? (
          <EmptyState icon="wallet" title="Belum ada top up" description="Top up yang berhasil akan tercatat di sini." />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {history.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="wallet" size={16} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white tabular">+ {formatRp(t.amount)}</p>
                  <p className="text-xs text-muted-foreground tabular">
                    {new Date(t.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
