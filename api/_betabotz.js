// Klien Betabotz Paygate — HANYA dipakai di server (folder api/). API key dibaca dari env, tidak pernah ke browser.
// Endpoint & field mengikuti dokumentasi resmi: https://web.btzpay.my.id/documentation
//   POST /api/qris/create · GET /api/qris/transaction/:id?key= · POST /api/qris/cancel/:id
const BASE = (process.env.BETABOTZ_BASE_URL || 'https://web.btzpay.my.id').replace(/\/$/, '')
const TIMEOUT_MS = 15000

export const baseUrl = () => BASE
export const isConfigured = () => Boolean(process.env.BETABOTZ_API_KEY && process.env.BETABOTZ_WEBHOOK_SECRET)

/** Hapus apikey / key transaksi dari teks sebelum dicatat atau dikirim ke klien. */
export function redact(s) {
  let out = String(s ?? '').replace(/([?&](?:key|apikey)=)[^&\s"']+/gi, '$1***')
  const k = process.env.BETABOTZ_API_KEY
  if (k) out = out.split(k).join('***')
  return out.slice(0, 300)
}

/** Log terstruktur dengan daftar field yang diizinkan — body request/callback tidak pernah dicatat utuh. */
export function log(level, event, fields = {}) {
  const safe = {}
  for (const k of ['topupId', 'txId', 'status', 'reason', 'action', 'httpStatus', 'message', 'changed']) {
    if (fields[k] !== undefined) safe[k] = typeof fields[k] === 'string' ? redact(fields[k]) : fields[k]
  }
  const line = JSON.stringify({ scope: 'btz', level, event, ...safe })
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line)
}

export class BtzError extends Error {
  constructor(message, httpStatus) { super(message); this.name = 'BtzError'; this.httpStatus = httpStatus }
}

async function request(path, { method = 'GET', body } = {}) {
  let r
  try {
    r = await fetch(BASE + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) { throw new BtzError(`koneksi ke Betabotz gagal (${e?.name ?? 'error'})`) }
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* bukan JSON */ }
  if (!r.ok || !json || json.success === false) throw new BtzError(redact(json?.message ?? `HTTP ${r.status}`), r.status)
  return json
}

function apiKey() {
  const k = process.env.BETABOTZ_API_KEY
  if (!k) throw new BtzError('BETABOTZ_API_KEY belum diset di environment server.')
  return k
}

/** Buat transaksi QRIS. Mengembalikan `data` (transactionId, accessKey, paymentUrl, qrisString, totalAmount, expiredAt, ...). */
export async function createQris({ amount, orderRef, productName, customerName, callbackUrl, returnUrl, timeoutMs, notes }) {
  const body = {
    apikey: apiKey(),
    amount,
    timeout: timeoutMs,
    callback_url: callbackUrl,
    return_url: returnUrl,
    notes,
    metadata: { orderId: orderRef, productName },
  }
  if (customerName) body.customerInfo = { name: customerName }
  if (process.env.BETABOTZ_PAYMENT_METHOD) body.paymentMethod = process.env.BETABOTZ_PAYMENT_METHOD // opsional: qrisdana|qrisgopay|qrisorkut|qrisshopeepay
  const json = await request('/api/qris/create', { method: 'POST', body })
  const d = json.data
  if (!d?.transactionId || !d?.accessKey) throw new BtzError('Respons create dari Betabotz tidak lengkap.')
  return d
}

/** Status transaksi (sumber kebenaran). Butuh accessKey dari respons create. */
export async function getTransaction(transactionId, accessKey) {
  const json = await request(`/api/qris/transaction/${encodeURIComponent(transactionId)}?key=${encodeURIComponent(accessKey)}`)
  return json.data
}

/** Batalkan transaksi pending. */
export async function cancelTransaction(transactionId, reason = 'cancelled_by_user') {
  const json = await request(`/api/qris/cancel/${encodeURIComponent(transactionId)}`, { method: 'POST', body: { apikey: apiKey(), reason } })
  return json.data
}
