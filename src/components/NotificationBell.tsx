import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/supabase'
import { Icon } from '../ui'
import { useToast } from '../feedback'
import { notifMeta, rowToNotification, timeAgo, type AppNotification } from '../lib/notifications'

// Tombol lonceng di header. Hanya membaca notifikasi milik user yang sedang login
// (dijaga Row Level Security di tabel `notifications`), jadi pesan yang ditujukan
// ke user lain tidak pernah sampai ke sini.
// Pengecekan pesan baru lewat polling ringan (tanpa websocket) — cukup untuk toko kecil.

const POLL_MS = 45_000
const LIMIT = 50

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const seen = useRef<Set<number> | null>(null) // id yang sudah pernah dimuat → deteksi pesan baru
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const rows = await api(`notifications?select=*&order=id.desc&limit=${LIMIT}`)
      const list = rows.map(rowToNotification)
      if (seen.current) {
        const known = seen.current
        const fresh = list.filter(n => !n.read && !known.has(n.id))
        if (fresh.length) toast(fresh.length === 1 ? `Pesan baru: ${fresh[0].title}` : `${fresh.length} pesan baru dari admin`, 'info')
      }
      seen.current = new Set(list.map(n => n.id))
      setItems(list)
    } catch {
      // Jaringan putus / migration_v11 belum dijalankan: diam saja, coba lagi di polling berikutnya.
    } finally { setLoaded(true) }
  }, [toast])

  useEffect(() => {
    seen.current = null
    setItems([]); setLoaded(false); setOpen(false)
    load()
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [userId, load])

  // Tutup panel saat klik di luar atau tekan Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = items.filter(n => !n.read).length

  async function markRead(ids: number[]) {
    setItems(list => list.map(n => ids.includes(n.id) ? { ...n, read: true } : n))
    try { await api('rpc/notifications_mark_read', { method: 'POST', body: { p_ids: ids } }) } catch { load() }
  }
  async function markAllRead() {
    setItems(list => list.map(n => ({ ...n, read: true })))
    try { await api('rpc/notifications_mark_read', { method: 'POST', body: {} }) } catch { load() }
  }
  async function remove(id: number) {
    setItems(list => list.filter(n => n.id !== id))
    try { await api(`notifications?id=eq.${id}`, { method: 'DELETE' }) } catch { load() }
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        aria-haspopup="dialog" aria-expanded={open}
        className="btn btn-ghost btn-icon relative"
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-[14px] text-white text-center tabular"
            style={{ background: '#ef4444', border: '2px solid #0b1220' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifikasi"
          className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[380px] rounded-2xl overflow-hidden shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
          style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.08)', animation: 'dialog-in 200ms' }}>
          <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-sm font-semibold text-white flex items-center gap-2">
              Notifikasi
              {unread > 0 && <span className="badge badge-primary">{unread} baru</span>}
            </p>
            <button onClick={markAllRead} disabled={unread === 0} className="btn btn-ghost btn-sm">
              <Icon name="checkCheck" size={14} /> Tandai semua dibaca
            </button>
          </div>

          <div className="max-h-[min(70vh,440px)] overflow-y-auto divide-y divide-white/[0.06]">
            {!loaded && <p className="hint text-center py-10">Memuat...</p>}
            {loaded && items.length === 0 && (
              <div className="flex flex-col items-center text-center py-10 px-6">
                <div className="icon-tile mb-3" style={{ width: 44, height: 44, borderRadius: 14 }}><Icon name="bell" size={20} /></div>
                <p className="text-sm font-medium text-white">Belum ada notifikasi</p>
                <p className="hint mt-1">Pesan dari admin akan muncul di sini.</p>
              </div>
            )}
            {items.map(n => {
              const m = notifMeta(n.type)
              const isOpen = expanded === n.id
              return (
                <div key={n.id}
                  onClick={() => { setExpanded(e => e === n.id ? null : n.id); if (!n.read) markRead([n.id]) }}
                  className={`group flex gap-3 px-4 py-3 cursor-pointer transition-colors duration-200 hover:bg-white/[0.03] ${n.read ? '' : 'bg-[#4f7cff]/[0.06]'}`}>
                  <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10, background: m.bg, color: m.color, borderColor: 'transparent' }}>
                    <Icon name={m.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className={`flex-1 text-[13px] leading-5 break-words ${n.read ? 'text-slate-300' : 'font-semibold text-white'}`}>{n.title}</p>
                      {!n.read && <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#4f7cff' }} aria-label="Belum dibaca" />}
                    </div>
                    <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-line break-words ${isOpen ? '' : 'line-clamp-2'}`}>{n.body}</p>
                    <p className="text-[11px] text-subtle mt-1.5">{m.label} · {timeAgo(n.createdAt)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); remove(n.id) }} aria-label="Hapus notifikasi"
                    className="btn btn-ghost btn-icon btn-sm self-start flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
