import { supabaseAdmin } from './_supabaseAdmin.js'

export async function getUserFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function requireUser(req, res) {
  const user = await getUserFromRequest(req)
  if (!user) { res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' }); return null }
  return user
}

export async function requireAdmin(req, res) {
  const user = await requireUser(req, res)
  if (!user) return null
  const provider = user.app_metadata?.provider
  const { data } = await supabaseAdmin.from('admins').select('email').eq('email', (user.email || '').toLowerCase()).maybeSingle()
  if (!data || provider !== 'google') {
    res.status(403).json({ error: 'Khusus admin.' }); return null
  }
  return user
}
