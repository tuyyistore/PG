// Webhook Betabotz (POST). Dokumentasi tidak menyebut tanda tangan callback, jadi payload TIDAK dipercaya:
//  1) URL callback membawa ?token=BETABOTZ_WEBHOOK_SECRET (dicek constant-time),
//  2) dari payload hanya diambil transactionId; status & nominal diambil ulang server→Betabotz,
//  3) saldo hanya bertambah lewat RPC atomik settle_gateway_topup (idempoten).
import { safeEqual, extractTransactionId } from './_btzLogic.js'
import { findByTransactionId, syncTopup } from './_btz.js'
import { log } from './_betabotz.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false })
  const secret = process.env.BETABOTZ_WEBHOOK_SECRET
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
