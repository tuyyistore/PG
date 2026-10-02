// POST { id } → batalkan top up gateway milik user. Cek status dulu (bisa jadi sudah dibayar), lalu batalkan di Betabotz.
import { requireUser } from './_auth.js'
import { supabaseAdmin } from './_supabaseAdmin.js'
import { findOwned, syncTopup } from './_btz.js'
import { cancelTransaction, log } from './_betabotz.js'
import { mapGatewayStatus } from './_btzLogic.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' })
  const user = await requireUser(req, res)
  if (!user) return
  const id = Number(req.body?.id)
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' })
  try {
    const topup = await findOwned(id, user.id)
    if (!topup) return res.status(404).json({ error: 'Top up tidak ditemukan.' })
    const before = await syncTopup(topup) // mungkin sudah terbayar/kedaluwarsa
    if (before.status !== 'pending') return res.status(200).json({ id, status: before.status, cancelled: before.status === 'cancelled' })

    let d
    try { d = await cancelTransaction(topup.btz_transaction_id) } catch (e) {
      log('warn', 'cancel_failed', { topupId: id, txId: topup.btz_transaction_id, message: e.message })
      const after = await syncTopup(topup).catch(() => before)
      if (after.status !== 'pending') return res.status(200).json({ id, status: after.status, cancelled: after.status === 'cancelled' })
      return res.status(409).json({ error: 'Pembayaran belum bisa dibatalkan. Coba lagi sebentar.' })
    }
    if (mapGatewayStatus(d?.status) !== 'cancelled') return res.status(409).json({ error: 'Pembayaran belum bisa dibatalkan. Coba lagi sebentar.' })
    await supabaseAdmin.from('topups').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending')
    log('info', 'topup_cancelled', { topupId: id, txId: topup.btz_transaction_id })
    return res.status(200).json({ id, status: 'cancelled', cancelled: true })
  } catch (e) {
    log('error', 'cancel_error', { topupId: id, message: e.message })
    return res.status(502).json({ error: 'Gagal membatalkan. Coba lagi.' })
  }
}
