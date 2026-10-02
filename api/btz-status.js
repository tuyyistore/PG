// GET ?id=<topupId> → fallback bila webhook terlambat/tidak sampai. Hanya pemilik top up.
import { requireUser } from './_auth.js'
import { findOwned, syncTopup } from './_btz.js'
import { log } from './_betabotz.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' })
  const user = await requireUser(req, res)
  if (!user) return
  const id = Number(req.query?.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' })
  try {
    const topup = await findOwned(id, user.id)
    if (!topup) return res.status(404).json({ error: 'Top up tidak ditemukan.' })
    const r = await syncTopup(topup)
    return res.status(200).json({ id, status: r.status ?? topup.status, paid: (r.status ?? topup.status) === 'approved' })
  } catch (e) {
    log('error', 'status_failed', { topupId: id, message: e.message })
    return res.status(502).json({ error: 'Gagal memeriksa status pembayaran. Coba lagi.' })
  }
}
