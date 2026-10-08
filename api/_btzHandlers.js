// Handler HTTP endpoint Betabotz dibuat lewat factory dengan dependensi yang diinjeksi
// (pola yang sama dengan createSyncer) supaya perilakunya bisa dites tanpa Supabase, jaringan, atau Vercel.
// File btz-callback.js / btz-status.js / btz-cancel.js hanya merangkai dependensi nyata ke factory ini.
import { safeEqual, extractTransactionId, mapGatewayStatus, createTtlCache } from './_btzLogic.js'

/** Webhook Betabotz (POST). Lihat catatan keamanan di btz-callback.js. */
export function createCallbackHandler({ getSecret, findByTransactionId, syncTopup, log }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false })
    const secret = getSecret()
    const token = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token
    if (!secret || !safeEqual(String(token ?? ''), secret)) {
      log('warn', 'callback_unauthorized')
      return res.status(401).json({ success: false })
    }

    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = null } }
    const txId = extractTransactionId(body)
    if (!txId) return res.status(400).json({ success: false })

    try {
      const topup = await findByTransactionId(txId)
      if (!topup) { log('warn', 'callback_unknown_tx', { txId }); return res.status(200).json({ success: true }) }
      const r = await syncTopup(topup)
      log('info', 'callback_processed', { topupId: topup.id, txId, status: r.status, changed: r.changed })
      return res.status(200).json({ success: true })
    } catch (e) {
      log('error', 'callback_failed', { txId, message: e.message })
      return res.status(502).json({ success: false }) // gateway boleh mengulang; polling status jadi cadangan
    }
  }
}

/**
 * GET ?id=<topupId> → fallback bila webhook terlambat. Hanya pemilik top up.
 * Throttle: selama top up masih pending, hasil dipakai ulang `throttleMs` supaya banyak tab/klien
 * tidak menembak Betabotz terus-menerus. Status final tidak di-cache (syncTopup sudah tidak menghubungi gateway).
 */
export function createStatusHandler({ requireUser, findOwned, syncTopup, log, throttleMs = 3000, now = Date.now }) {
  const cache = createTtlCache(throttleMs, { now })
  return async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method tidak diizinkan.' })
    const user = await requireUser(req, res)
    if (!user) return
    const id = Number(req.query?.id)
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID tidak valid.' })
    const key = `${user.id}:${id}`
    const cached = cache.get(key)
    if (cached) return res.status(200).json(cached)
    try {
      const topup = await findOwned(id, user.id)
      if (!topup) return res.status(404).json({ error: 'Top up tidak ditemukan.' })
      const r = await syncTopup(topup)
      const status = r.status ?? topup.status
      const payload = { id, status, paid: status === 'approved' }
      if (status === 'pending') cache.set(key, payload)
      return res.status(200).json(payload)
    } catch (e) {
      log('error', 'status_failed', { topupId: id, message: e.message })
      return res.status(502).json({ error: 'Gagal memeriksa status pembayaran. Coba lagi.' })
    }
  }
}

/** POST { id } → batalkan top up gateway milik user. Cek status dulu (bisa jadi sudah dibayar), lalu batalkan di Betabotz. */
export function createCancelHandler({ requireUser, findOwned, syncTopup, cancelTransaction, markCancelled, log }) {
  const busy = { error: 'Pembayaran belum bisa dibatalkan. Coba lagi sebentar.' }
  return async function handler(req, res) {
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
        return res.status(409).json(busy)
      }
      if (mapGatewayStatus(d?.status) !== 'cancelled') return res.status(409).json(busy)
      // Bila update ini gagal, status 'cancel' di gateway akan disinkronkan oleh syncTopup berikutnya (self-healing).
      try { await markCancelled(id) } catch (e) { log('warn', 'mark_cancelled_failed', { topupId: id, message: e.message }) }
      log('info', 'topup_cancelled', { topupId: id, txId: topup.btz_transaction_id })
      return res.status(200).json({ id, status: 'cancelled', cancelled: true })
    } catch (e) {
      log('error', 'cancel_error', { topupId: id, message: e.message })
      return res.status(502).json({ error: 'Gagal membatalkan. Coba lagi.' })
    }
  }
}
