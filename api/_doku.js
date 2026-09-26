// Wrapper tipis di atas DOKU Checkout API (https://developers.doku.com/).
//
// Berbeda dari GoBiz (yang cuma memindai histori transaksi GoPay Merchant lalu
// mencocokkan nominal), DOKU melacak tiap transaksi lewat invoice_number yang kita
// buat sendiri — jadi tidak perlu lagi trik "nominal unik" (kode 1-99 di belakang
// nominal) untuk membedakan pembayaran satu sama lain.
//
// Kredensial (Client-Id & Secret Key) didapat dari DOKU Back Office, disimpan di
// environment variable Vercel: DOKU_CLIENT_ID, DOKU_SECRET_KEY, DOKU_IS_PRODUCTION.
import crypto from 'node:crypto'

const BASE_URL = process.env.DOKU_IS_PRODUCTION === 'true' ? 'https://api.doku.com' : 'https://api-sandbox.doku.com'
const CLIENT_ID = process.env.DOKU_CLIENT_ID
const SECRET_KEY = process.env.DOKU_SECRET_KEY

function requestTimestamp() {
  // Format ISO8601 UTC+0, tanpa milidetik (mis. 2024-01-15T08:45:42Z).
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function digestOf(bodyString) {
  return crypto.createHash('sha256').update(bodyString, 'utf8').digest('base64')
}

function signatureOf({ requestId, timestamp, target, digest }) {
  const lines = [`Client-Id:${CLIENT_ID}`, `Request-Id:${requestId}`, `Request-Timestamp:${timestamp}`, `Request-Target:${target}`]
  if (digest) lines.push(`Digest:${digest}`)
  const component = lines.join('\n')
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(component, 'utf8').digest('base64')
  return `HMACSHA256=${hmac}`
}

async function dokuRequest(method, path, bodyObj) {
  if (!CLIENT_ID || !SECRET_KEY) throw new Error('DOKU_CLIENT_ID / DOKU_SECRET_KEY belum diset di environment Vercel.')
  const requestId = crypto.randomUUID()
  const timestamp = requestTimestamp()
  const bodyString = bodyObj ? JSON.stringify(bodyObj) : undefined
  const digest = bodyString ? digestOf(bodyString) : undefined
  const signature = signatureOf({ requestId, timestamp, target: path, digest })

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': CLIENT_ID,
      'Request-Id': requestId,
      'Request-Timestamp': timestamp,
      Signature: signature,
    },
    body: bodyString,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message?.[0] || data?.error || `DOKU error (${res.status})`)
  return data
}

/**
 * Buat transaksi pembayaran QRIS lewat DOKU Checkout, dapatkan payment.url
 * (halaman checkout ber-QR yang di-embed lewat jokul-checkout-js di frontend).
 */
export async function createQrisPayment({ invoiceNumber, amount, paymentDueMinutes = 60 }) {
  const data = await dokuRequest('POST', '/checkout/v1/payment', {
    order: { amount: Math.round(amount), invoice_number: invoiceNumber, auto_redirect: false },
    payment: { payment_method_types: ['QRIS'], payment_due_date: paymentDueMinutes },
  })
  const p = data?.response?.payment
  if (!p?.url) throw new Error('DOKU tidak mengembalikan payment.url')
  // expired_date format yyyyMMddHHmmss, waktu UTC+7 (WIB).
  const m = String(p.expired_date).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  const expiresAt = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 7, +m[5], +m[6]) : undefined
  return { url: p.url, tokenId: p.token_id, expiresAt }
}

/** Cek status transaksi berdasarkan invoice_number. Return status mentah dari DOKU. */
export async function checkPaymentStatus(invoiceNumber) {
  const path = `/orders/v1/status/${encodeURIComponent(invoiceNumber)}`
  try {
    const data = await dokuRequest('GET', path)
    return {
      status: data?.transaction?.status ?? 'PENDING',
      txId: data?.transaction?.original_request_id ?? invoiceNumber,
      amount: data?.order?.amount,
    }
  } catch (e) {
    // DOKU balas 404 kalau transaksi belum pernah dibayar sama sekali — anggap pending.
    if (/404|not found/i.test(e.message)) return { status: 'PENDING', txId: null }
    throw e
  }
}
