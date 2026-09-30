import { useCallback, useEffect, useState } from 'react'
import { ADMIN_EMAIL, api, type Row } from '../lib/supabase'
import { Icon, EmptyState, SkeletonRows } from '../ui'
import { useConfirm, useToast } from '../feedback'
import { NOTIF_META, NOTIF_TYPES, findUsers, notifMeta, rowHandle, type NotifType } from '../lib/notifications'

// Tab "Pesan" di Dashboard Admin: kirim notifikasi ke SATU pengguna (email / ID USR-… / @username)
// atau ke SEMUA pengguna. Pengiriman & validasi dilakukan di database (RPC admin_send_notification),
// jadi hanya admin yang bisa mengirim dan pesan ke satu user tidak bisa bocor ke user lain.

const TITLE_MAX = 100
const BODY_MAX = 1000

type Audience = 'user' | 'all'

export function AdminMessages({ users, prefill }: { users: Row[]; prefill: { target: string; n: number } | null }) {
  const toast = useToast()
  const ask = useConfirm()
  const [audience, setAudience] = useState<Audience>('user')
  const [target, setTarget] = useState('')
  const [type, setType] = useState<NotifType>('info')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const [batches, setBatches] = useState<Row[] | null>(null)
  const [batchErr, setBatchErr] = useState('')

  // Tombol "Kirim Pesan" di detail pengguna mengisi tujuan otomatis.
  useEffect(() => { if (prefill) { setAudience('user'); setTarget(prefill.target); setErr('') } }, [prefill])

  const loadBatches = useCallback(async () => {
    try {
      setBatches(await api('notification_batches?select=*&order=id.desc&limit=50')); setBatchErr('')
    } catch (e) {
      setBatches([])
      setBatchErr(`${(e as Error).message}. Pastikan supabase/migration_v11.sql sudah dijalankan.`)
    }
  }, [])
  useEffect(() => { loadBatches() }, [loadBatches])

  const matches = audience === 'user' ? findUsers(users, target) : []
  const allCount = users.filter(u => (u.email ?? '').toLowerCase() !== ADMIN_EMAIL).length

  async function send() {
    setErr('')
    const t = title.trim(), b = body.trim()
    if (audience === 'user' && !target.trim()) return setErr('Isi email atau ID pengguna tujuan.')
    if (audience === 'user' && matches.length > 1) return setErr('Lebih dari satu pengguna cocok. Gunakan ID pengguna (USR-…).')
    if (!t) return setErr('Judul pesan wajib diisi.')
    if (!b) return setErr('Isi pesan wajib diisi.')
    if (audience === 'all') {
      const ok = await ask({
        title: 'Kirim ke semua pengguna?',
        description: `Pesan "${t}" akan masuk ke notifikasi ±${allCount} pengguna. Kamu masih bisa menariknya lewat Riwayat pesan.`,
        confirmLabel: 'Ya, kirim ke semua',
      })
      if (!ok) return
    }
    setSending(true)
    try {
      const res = await api<{ recipients?: number }>('rpc/admin_send_notification', {
        method: 'POST',
        body: { p_audience: audience, p_target: audience === 'user' ? target.trim() : null, p_type: type, p_title: t, p_body: b },
      })
      toast(audience === 'all' ? `Pesan terkirim ke ${res?.recipients ?? allCount} pengguna` : 'Pesan terkirim ke pengguna')
      setTitle(''); setBody('')
      if (audience === 'user') setTarget('')
      loadBatches()
    } catch (e) { setErr((e as Error).message) } finally { setSending(false) }
  }

  async function retract(b: Row) {
    const ok = await ask({
      title: 'Tarik pesan ini?',
      description: `"${b.title}" akan dihapus dari notifikasi ${b.audience === 'all' ? 'semua penerima' : 'penerima'}.`,
      confirmLabel: 'Tarik pesan', danger: true,
    })
    if (!ok) return
    try { await api(`notification_batches?id=eq.${b.id}`, { method: 'DELETE' }); toast('Pesan ditarik'); loadBatches() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
      <div className="card p-4 sm:p-5 space-y-4">
        <div>
          <p className="section-title flex items-center gap-2"><Icon name="send" size={16} className="text-muted-foreground" /> Kirim Pesan</p>
          <p className="hint mt-1">Pesan muncul di tombol lonceng milik penerima.</p>
        </div>

        {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{err}</span></div>}

        <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827] w-full sm:w-auto" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={() => { setAudience('user'); setErr('') }} className={`chip flex-1 sm:flex-none justify-center gap-1.5 ${audience === 'user' ? 'chip-active' : ''}`}>
            <Icon name="user" size={14} /> Satu pengguna
          </button>
          <button onClick={() => { setAudience('all'); setErr('') }} className={`chip flex-1 sm:flex-none justify-center gap-1.5 ${audience === 'all' ? 'chip-active' : ''}`}>
            <Icon name="megaphone" size={14} /> Semua pengguna
          </button>
        </div>

        {audience === 'user' ? (
          <label className="block">
            <span className="label">Email atau ID pengguna</span>
            <input className="input" placeholder="nama@gmail.com  ·  USR-K7M2QX9P  ·  @username" value={target}
              onChange={e => setTarget(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            {target.trim() && (
              matches.length === 1 ? (
                <div className="card-inset flex items-center gap-3 px-3 py-2.5 mt-2">
                  <div className="icon-tile" style={{ width: 32, height: 32, borderRadius: 10, color: '#4ade80' }}><Icon name="check" size={15} /></div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{matches[0].full_name || rowHandle(matches[0])}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{rowHandle(matches[0])} · <span className="font-mono">{matches[0].user_code}</span></p>
                  </div>
                </div>
              ) : (
                <p className="hint mt-1.5" style={{ color: matches.length > 1 ? '#fbbf24' : undefined }}>
                  {matches.length > 1 ? 'Lebih dari satu pengguna cocok, gunakan ID pengguna (USR-…).' : 'Belum ada pengguna yang cocok di daftar. Cek lagi penulisannya.'}
                </p>
              )
            )}
          </label>
        ) : (
          <div className="alert alert-info">
            <Icon name="megaphone" size={16} className="mt-0.5 flex-shrink-0" />
            <span>Pesan dikirim ke <b>semua pengguna terdaftar</b> (±{allCount} akun, tidak termasuk akun admin). Pengguna yang mendaftar setelah ini tidak ikut menerima.</span>
          </div>
        )}

        <div>
          <span className="label">Tipe</span>
          <div className="flex flex-wrap gap-2">
            {NOTIF_TYPES.map(k => {
              const m = NOTIF_META[k], active = type === k
              return (
                <button key={k} onClick={() => setType(k)} title={m.hint} aria-pressed={active}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13px] font-medium transition-colors duration-200"
                  style={active
                    ? { background: m.bg, color: m.color, border: `1px solid ${m.color}55` }
                    : { color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Icon name={m.icon} size={14} /> {m.label}
                </button>
              )
            })}
          </div>
          <p className="hint mt-1.5">{NOTIF_META[type].hint}</p>
        </div>

        <label className="block">
          <span className="label">Judul</span>
          <input className="input" placeholder="mis. Pesananmu sudah aktif" maxLength={TITLE_MAX} value={title} onChange={e => setTitle(e.target.value)} />
          <span className="hint block text-right mt-1 tabular">{title.length}/{TITLE_MAX}</span>
        </label>
        <label className="block">
          <span className="label">Isi pesan</span>
          <textarea className="input" rows={5} placeholder="Tulis pesan untuk pengguna..." maxLength={BODY_MAX} value={body} onChange={e => setBody(e.target.value)} />
          <span className="hint block text-right mt-1 tabular">{body.length}/{BODY_MAX}</span>
        </label>

        <div className="flex justify-end">
          <button onClick={send} disabled={sending || !title.trim() || !body.trim() || (audience === 'user' && !target.trim())} className="btn btn-primary w-full sm:w-auto">
            {sending
              ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Mengirim...</>
              : <><Icon name="send" size={15} /> {audience === 'all' ? 'Kirim ke Semua' : 'Kirim Pesan'}</>}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="section-title">Riwayat pesan</p>
          <p className="text-xs text-muted-foreground mt-0.5">50 pengiriman terakhir. Tombol hapus menarik pesan dari notifikasi penerima.</p>
        </div>
        {batchErr && <div className="alert alert-warning m-4"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{batchErr}</span></div>}
        {batches === null && <SkeletonRows rows={3} />}
        {batches !== null && batches.length === 0 && !batchErr && <EmptyState icon="send" title="Belum ada pesan terkirim." description="Pesan yang kamu kirim akan tercatat di sini." />}
        <div className="divide-y divide-white/[0.06]">
          {batches?.map(b => {
            const m = notifMeta(b.type)
            return (
              <div key={b.id} className="px-4 sm:px-5 py-3.5 flex items-start gap-3">
                <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10, background: m.bg, color: m.color, borderColor: 'transparent' }}>
                  <Icon name={m.icon} size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white break-words">{b.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line break-words line-clamp-2">{b.body}</p>
                  <p className="text-[11px] text-subtle mt-1.5 break-words">
                    {m.label} · {b.audience === 'all' ? `Semua pengguna (${b.recipient_count} penerima)` : `Ke ${b.target_label ?? 'pengguna'}`} ·{' '}
                    {new Date(b.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <button onClick={() => retract(b)} className="btn btn-ghost btn-icon btn-sm flex-shrink-0" aria-label="Tarik pesan" title="Tarik pesan"><Icon name="trash" size={14} /></button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
