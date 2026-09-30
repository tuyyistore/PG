import { type IconName } from '../ui'
import { USERNAME_DOMAIN, type Row } from './supabase'

// ─── Tipe notifikasi (satu sumber kebenaran) ──────────────────────────────────
// Daftar ini HARUS sama dengan check constraint `type` di supabase/migration_v11.sql.
// Menambah tipe baru: tambah di NOTIF_TYPES + NOTIF_META di sini, lalu ubah constraint-nya.

export const NOTIF_TYPES = ['info', 'pesanan', 'saldo', 'promo', 'peringatan'] as const
export type NotifType = (typeof NOTIF_TYPES)[number]

export const NOTIF_META: Record<NotifType, { label: string; icon: IconName; color: string; bg: string; hint: string }> = {
  info:       { label: 'Informasi',  icon: 'info',          color: '#8fb0ff', bg: 'rgba(79,124,255,0.14)',  hint: 'Kabar atau pengumuman umum.' },
  pesanan:    { label: 'Pesanan',    icon: 'clipboard',     color: '#38dcf5', bg: 'rgba(56,220,245,0.12)',  hint: 'Update pesanan / data akun.' },
  saldo:      { label: 'Saldo',      icon: 'wallet',        color: '#4ade80', bg: 'rgba(34,197,94,0.14)',   hint: 'Top up, refund, atau mutasi saldo.' },
  promo:      { label: 'Promo',      icon: 'tag',           color: '#c4b5fd', bg: 'rgba(167,139,250,0.14)', hint: 'Diskon dan penawaran.' },
  peringatan: { label: 'Peringatan', icon: 'alertTriangle', color: '#fbbf24', bg: 'rgba(245,158,11,0.14)',  hint: 'Hal penting yang perlu perhatian.' },
}

/** Aman dipakai untuk nilai dari database: tipe tak dikenal jatuh ke "info". */
export const notifMeta = (t: string) => NOTIF_META[t as NotifType] ?? NOTIF_META.info

export interface AppNotification {
  id: number
  type: NotifType
  title: string
  body: string
  read: boolean
  createdAt: string
}

export const rowToNotification = (r: Row): AppNotification => ({
  id: r.id,
  type: (NOTIF_TYPES as readonly string[]).includes(r.type) ? r.type : 'info',
  title: r.title ?? '',
  body: r.body ?? '',
  read: Boolean(r.read_at),
  createdAt: r.created_at,
})

// ─── Pencarian pengguna (email / ID / username) ───────────────────────────────
// Meniru public.resolve_user_target() di database supaya pratinjau di form admin sama
// dengan hasil asli. Yang menentukan tetap server (database).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function findUsers(users: Row[], raw: string): Row[] {
  const t = raw.trim()
  if (!t) return []
  const lower = t.toLowerCase()
  if (lower.startsWith('usr-')) return users.filter(u => String(u.user_code ?? '').toLowerCase() === lower)
  if (UUID_RE.test(t)) return users.filter(u => String(u.id).toLowerCase() === lower)
  if (t.startsWith('@')) return users.filter(u => String(u.username ?? '').toLowerCase() === lower.slice(1))
  if (t.includes('@')) return users.filter(u => String(u.email ?? '').toLowerCase() === lower)
  return users.filter(u => String(u.username ?? '').toLowerCase() === lower)
}

/** Untuk tampilan: akun username → "@username", akun Google/GitHub → email asli. */
export function rowHandle(u: Row): string {
  const email: string = u.email ?? ''
  if (email.endsWith(`@${USERNAME_DOMAIN}`)) return `@${u.username || email.split('@')[0]}`
  return email || '(tanpa email)'
}

// ─── Waktu relatif ────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Baru saja'
  if (min < 60) return `${min} menit lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} jam lalu`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Kemarin'
  if (day < 7) return `${day} hari lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}
