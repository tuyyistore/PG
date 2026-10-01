import { useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import waLogo from '../assets/brand/whatsapp.webp'
import { openLiveChat } from '../components/Layout'
import { Icon, formatRp, PageHeader, EmptyState, StatusBadge, SkeletonRows } from '../ui'
import { useToast } from '../feedback'

const WA_NUMBER = '6283121214520'
const PRESETS = [10000, 25000, 50000, 100000]

const waUrl = (text: string) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`

export function SaldoPage({ saldo, userId }: { saldo: number; userId: string }) {
  const [history, setHistory] = useState<Row[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  const [payInfo, setPayInfo] = useState('')
  const toast = useToast()

  const loadHistory = () => api(`topups?select=id,amount,unique_code,status,created_at&user_id=eq.${userId}&order=id.desc&limit=10`).then(setHistory).catch(() => setHistory([]))
  const refreshHistory = async () => {
    if (refreshing) return
    setRefreshing(true)
    await Promise.all([loadHistory(), new Promise(r => setTimeout(r, 700))])
    setRefreshing(false)
  }
  useEffect(() => { loadHistory() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api('rpc/get_public_settings', { method: 'POST', body: {} })
      .then(rows => setPayInfo(rows.find((r: Row) => r.key === 'pay_info')?.value ?? ''))
      .catch(() => {})
  }, [])

  const nominal = Number(amount.replace(/\D/g, ''))

  async function createRequest() {
    setCreating(true); setErr('')
    try {
      await api('rpc/request_topup', { method: 'POST', body: { p_amount: nominal } })
      setAmount('')
      toast('Permintaan top up dibuat. Transfer sesuai nominal lalu konfirmasi ke admin.')
      await loadHistory()
    } catch (e) { setErr((e as Error).message) } finally { setCreating(false) }
  }

  const pending = (history ?? []).filter(t => t.status === 'pending' && t.unique_code)

  return (
    <div className="space-y-6">
      <PageHeader title="Saldo" subtitle="Saldo dan riwayat top up akunmu." />

      <div className="card p-5 sm:p-6 space-y-4">
        <div className="card-inset p-4">
          <p className="text-xs text-muted-foreground">Saldo kamu</p>
          <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(saldo)}</p>
        </div>

        <div>
          <span className="label">Nominal top up</span>
          <input className="input" inputMode="numeric" value={amount ? nominal.toLocaleString('id-ID') : ''} onChange={e => setAmount(e.target.value)} placeholder="mis. 50.000" />
          <div className="flex gap-2 flex-wrap mt-2">
            {PRESETS.map(v => <button key={v} type="button" onClick={() => setAmount(String(v))} className="chip">{formatRp(v)}</button>)}
          </div>
        </div>
        {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{err}</span></div>}
        <button type="button" onClick={createRequest} disabled={creating || nominal < 1000} className="btn btn-primary btn-lg btn-block">
          {creating ? 'Membuat...' : <><Icon name="card" size={18} /> Buat Permintaan Top Up</>}
        </button>
        <p className="hint">Setiap permintaan mendapat kode unik 1–99 yang ditambahkan ke nominal transfer supaya admin mudah mencocokkan. Saldo masuk setelah admin memverifikasi.</p>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map(t => {
            const total = Number(t.amount) + Number(t.unique_code)
            return (
              <div key={t.id} className="card p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="section-title">Menunggu pembayaran</h2>
                  <StatusBadge status={t.status} />
                </div>
                <div className="card-inset p-4">
                  <p className="text-xs text-muted-foreground">Transfer tepat sebesar</p>
                  <p className="text-2xl font-semibold text-white tracking-tight tabular mt-0.5">{formatRp(total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Saldo yang masuk: {formatRp(t.amount)}</p>
                </div>
                {payInfo && <p className="text-[13px] text-slate-200 whitespace-pre-wrap">{payInfo}</p>}
                <a href={waUrl(`Halo admin, saya sudah transfer ${formatRp(total)} untuk top up #${t.id} di Tuyyi Store.`)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block">
                  <img src={waLogo} alt="" width={20} height={20} className="flex-shrink-0" /> Konfirmasi via WhatsApp
                </a>
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href={waUrl('Halo admin, saya mau tambah saldo di Tuyyi Store.')} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          <img src={waLogo} alt="" width={20} height={20} className="flex-shrink-0" /> WhatsApp
        </a>
        <button type="button" onClick={openLiveChat} className="btn btn-primary">
          <Icon name="headset" size={18} /> Chat Live
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="section-title">Riwayat top up</h2>
            <p className="text-xs text-muted-foreground mt-0.5">10 transaksi terakhir</p>
          </div>
          <button onClick={refreshHistory} disabled={refreshing} aria-busy={refreshing} className="btn btn-ghost btn-icon btn-sm -mr-2" aria-label="Muat ulang riwayat">
            <span className={`inline-flex ${refreshing ? 'animate-spin' : ''}`}><Icon name="refresh" size={16} /></span>
          </button>
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
