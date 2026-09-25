// Klien Supabase ringan (tanpa SDK) — Google OAuth + REST (PostgREST).
// Keamanan sebenarnya ada di Row Level Security (lihat supabase/schema.sql).
export type SessionUser = {
  id: string
  email?: string
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string }
}
export type Session = { access_token: string; refresh_token: string; expires_at: number; user: SessionUser }
export type Row = Record<string, any>

const BASE = ((import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, '')
const KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
export const configured = Boolean(BASE && KEY)
export const ADMIN_EMAIL = 'warungtuyyi@gmail.com' // hanya untuk UI; hak akses dijaga RLS di database
export const displayName = (u: SessionUser) => u.user_metadata?.full_name || u.user_metadata?.name || u.email || 'Pengguna'

const STORE = 'wt-session'
let current: Session | null = null
const now = () => Math.floor(Date.now() / 1000)

function keep(s: Session | null) {
  current = s
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE) } catch {}
}

async function auth<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const r = await fetch(`${BASE}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!r.ok) throw new Error(r.statusText)
  return (r.status === 204 ? null : await r.json()) as T
}

export function signInWithGoogle() {
  location.href = `${BASE}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(location.origin)}`
}

async function refresh(s: Session): Promise<Session | null> {
  try {
    const d = await auth<any>('token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) })
    const n: Session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: now() + d.expires_in, user: d.user }
    keep(n)
    return n
  } catch { keep(null); return null }
}

/** Dipanggil sekali saat aplikasi dibuka: tangkap callback Google atau pulihkan sesi. */
export async function initSession(): Promise<Session | null> {
  if (!configured) return null
  const h = new URLSearchParams(location.hash.slice(1))
  const access_token = h.get('access_token')
  if (access_token) {
    history.replaceState(null, '', location.pathname + location.search)
    try {
      const user = await auth<SessionUser>('user', {}, access_token)
      const s: Session = { access_token, refresh_token: h.get('refresh_token') ?? '', expires_at: now() + Number(h.get('expires_in') ?? 3600), user }
      keep(s)
      return s
    } catch { return null }
  }
  try { const raw = localStorage.getItem(STORE); if (raw) current = JSON.parse(raw) } catch {}
  if (current && current.expires_at - 60 < now()) return refresh(current)
  return current
}

export async function signOut() {
  const t = current?.access_token
  keep(null)
  if (t) try { await auth('logout', { method: 'POST' }, t) } catch {}
}

/** Upload file ke Supabase Storage (bucket harus publik). Mengembalikan URL publik file. */
export async function uploadFile(bucket: string, path: string, file: File): Promise<string> {
  if (current && current.expires_at - 60 < now()) await refresh(current)
  const r = await fetch(`${BASE}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${current?.access_token ?? KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  })
  if (!r.ok) {
    let m = r.statusText
    try { m = (await r.json()).message ?? m } catch {}
    throw new Error(m)
  }
  return `${BASE}/storage/v1/object/public/${bucket}/${path}`
}

export async function api<T = Row[]>(path: string, opt: { method?: string; body?: unknown } = {}): Promise<T> {
  if (current && current.expires_at - 60 < now()) await refresh(current)
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method: opt.method ?? 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${current?.access_token ?? KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: opt.body === undefined ? undefined : JSON.stringify(opt.body),
  })
  if (!r.ok) {
    let m = r.statusText
    try { m = (await r.json()).message ?? m } catch {}
    throw new Error(m)
  }
  const txt = await r.text()
  return (txt ? JSON.parse(txt) : null) as T
}
