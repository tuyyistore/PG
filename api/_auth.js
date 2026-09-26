// Helper verifikasi pengguna & admin untuk endpoint serverless (folder /api).
// Frontend mengirim Authorization: Bearer <access_token> lewat apiFn() di src/lib/supabase.ts.
import { supabaseAdmin } from './_supabaseAdmin.js'

const ADMIN_EMAIL = 'warungtuyyi@gmail.com'

/** Ambil user dari header Authorization. Return null kalau token tidak ada/tidak valid. */
export async function getUserFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

/** Wajib login. Kirim 401 & return null kalau tidak ada sesi valid. */
export async function requireUser(req, res) {
  const user = await getUserFromRequest(req)
  if (!user) { res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' }); return null }
  return user
}

/** Wajib admin (email sama seperti public.is_admin() di database). */
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res)
  if (!user) return null
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    res.status(403).json({ error: 'Khusus admin.' }); return null
  }
  return user
}
