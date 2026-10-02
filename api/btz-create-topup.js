// POST { amount } → membuat top up QRIS Betabotz untuk user yang login.
import { requireUser } from './_auth.js'
import { supabaseAdmin } from './_supabaseAdmin.js'
import { createQris, getTransaction, cancelTransaction, isConfigured, baseUrl, log } from './_betabotz.js'
import { topupRef, sanitizeTx, safePaymentUrl } from './_btzLogic.js'

const siteUrl = (req) => (process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/$/, '')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method tidak diizinkan.' })
  const user = await requireUser(req, res)
  if (!user) return
  if (!isConfigured()) return res.status(503).json({ error: 'Pembayaran otomatis belum diaktifkan. Gunakan top up manual.' })

  const amount = Number(req.body?.amount)
  if (!Number.isInteger(amount) || amount < 1000 || amount > 10000000) {
    return res.status(400).json({ error: 'Nominal top up Rp 1.000 - Rp 10.000.000' })
  }

  const { data: topupId, error: rowErr } = await supabaseAdmin.rpc('create_gateway_topup', { p_uid: user.id, p_amount: amount })
  if (rowErr) {
    if (rowErr.code === 'P0001') return res.status(400).json({ error: rowErr.message }) // pesan raise exception dari fungsi kita
    log('error', 'create_row_failed', { reason: rowErr.code, message: rowErr.message })
    return res.status(500).json({ error: 'Gagal membuat permintaan top up.' })
  }

  const site = siteUrl(req)
  const minutes = Math.min(60, Math.max(1, Number(process.env.BETABOTZ_TIMEOUT_MINUTES) || 30))
  const failRow = (reason) => supabaseAdmin.from('topups').update({ status: 'cancelled', gateway_response: { error: reason } }).eq('id', topupId).eq('status', 'pending')

  let d
  try {
    d = await createQris({
      amount,
      orderRef: topupRef(topupId),
      productName: 'Top up saldo TUYYI STORE',
      customerName: user.user_metadata?.full_name || user.user_metadata?.username || undefined,
      notes: `Top up saldo #${topupId}`,
      callbackUrl: `${site}/api/btz-callback?token=${encodeURIComponent(process.env.BETABOTZ_WEBHOOK_SECRET)}`,
      returnUrl: `${site}/topup`,
      timeoutMs: minutes * 60000,
    })
  } catch (e) {
    log('error', 'create_failed', { topupId, message: e.message, httpStatus: e.httpStatus })
    await failRow('create_failed')
    return res.status(502).json({ error: 'Gagal membuat pembayaran di Betabotz. Coba lagi sebentar.' })
  }

  // Beberapa metode mengembalikan qrisString kosong saat create; coba ambil dari detail transaksi.
  let qris = d.qrisString || ''
  if (!qris) {
    try { qris = (await getTransaction(d.transactionId, d.accessKey))?.qrisString || '' }
    catch (e) { log('warn', 'qris_fetch_failed', { topupId, txId: d.transactionId, message: e.message }) }
  }

  const paymentUrl = safePaymentUrl(d.paymentUrl, baseUrl())
  if (d.paymentUrl && !paymentUrl) log('warn', 'payment_url_rejected', { topupId, txId: d.transactionId })

  const { error: updErr } = await supabaseAdmin.from('topups').update({
    btz_transaction_id: d.transactionId,
    btz_access_key: d.accessKey,
    payment_url: paymentUrl,
    qris_string: qris || null,
    total_amount: Number.isFinite(Number(d.totalAmount)) ? Number(d.totalAmount) : null,
    gateway_fee: Number.isFinite(Number(d.fee)) ? Number(d.fee) : null,
    expired_at: d.expiredAt && !Number.isNaN(Date.parse(d.expiredAt)) ? new Date(d.expiredAt).toISOString() : null,
    gateway_response: sanitizeTx(d),
  }).eq('id', topupId)
  if (updErr) {
    // Transaksi sudah ada di Betabotz tapi tidak tercatat → batalkan supaya tidak ada pembayaran "yatim".
    log('error', 'persist_failed', { topupId, txId: d.transactionId, message: updErr.message })
    try { await cancelTransaction(d.transactionId, 'persist_failed') } catch (e) { log('error', 'cancel_after_persist_failed', { topupId, txId: d.transactionId, message: e.message }) }
    await failRow('persist_failed')
    return res.status(500).json({ error: 'Gagal menyimpan pembayaran. Coba lagi.' })
  }

  log('info', 'topup_created', { topupId, txId: d.transactionId })
  return res.status(201).json({ id: topupId, paymentUrl, qrisString: qris || null, totalAmount: Number(d.totalAmount) || null, expiredAt: d.expiredAt || null })
}
