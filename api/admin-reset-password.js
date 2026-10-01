import { requireAdmin } from './_auth.js'
import { supabaseAdmin } from './_supabaseAdmin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' })
  const admin = await requireAdmin(req, res)
  if (!admin) return

  const { user_id, new_password } = req.body || {}
  if (typeof user_id !== 'string' || typeof new_password !== 'string') return res.status(400).json({ error: 'Data tidak lengkap.' })
  if (new_password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' })

  const { data: target, error: getErr } = await supabaseAdmin.auth.admin.getUserById(user_id)
  if (getErr || !target?.user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })
  if (!(target.user.email || '').endsWith('@users.tuyyistore.internal')) {
    return res.status(400).json({ error: 'Hanya akun username yang bisa direset dari sini.' })
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password })
  if (error) return res.status(500).json({ error: error.message })

  await supabaseAdmin.from('audit_log').insert({ actor: admin.id, action: 'reset_password', target: user_id, detail: {} })
  return res.status(200).json({ ok: true })
}
