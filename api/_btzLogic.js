// Logika murni integrasi Betabotz Paygate (tanpa env / DB / jaringan) — mudah dites.
import { createHash, timingSafeEqual } from 'node:crypto'

/** Referensi order yang dikirim ke Betabotz (metadata.orderId) dan dicek balik saat verifikasi. */
export const topupRef = (id) => `TOPUP-${id}`

// Status transaksi Betabotz (dokumentasi): pending, sukses, gagal, expired, cancel.
const STATUS_MAP = { pending: 'pending', sukses: 'approved', gagal: 'rejected', expired: 'expired', cancel: 'cancelled' }
export function mapGatewayStatus(raw) {
  const k = String(raw ?? '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(STATUS_MAP, k) ? STATUS_MAP[k] : null // tak dikenal → null (tidak diubah)
}

/** Ambil transactionId dari payload callback (pay_id / raw.data.transactionId). Payload TIDAK dipercaya selain id ini. */
export function extractTransactionId(body) {
  const b = body && typeof body === 'object' ? body : {}
  const id = b.pay_id ?? b.raw?.data?.transactionId ?? b.data?.transactionId ?? b.transactionId
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null
}

/** Bandingkan rahasia tanpa celah timing. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** Buang field rahasia sebelum respons Betabotz disimpan/dicatat. */
export function sanitizeTx(tx) {
  if (!tx || typeof tx !== 'object') return {}
  const { accessKey, apikey, apiKey, key, ...rest } = tx
  return rest
}

/** Hanya terima paymentUrl https di host Betabotz yang dikonfigurasi. */
export function safePaymentUrl(url, baseUrl) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.host === new URL(baseUrl).host ? u.toString() : null
  } catch { return null }
}

/**
 * Bandingkan top up lokal dengan transaksi yang DIAMBIL SERVER dari Betabotz (bukan dari body callback).
 * action: 'credit' | 'mark' (+status) | 'none' | 'mismatch'
 */
export function evaluateTransaction(topup, tx) {
  if (!tx || typeof tx !== 'object') return { action: 'none', reason: 'empty_response' }
  if (tx.transactionId !== topup.btz_transaction_id) return { action: 'mismatch', reason: 'transaction_id' }
  const ref = tx.metadata?.orderId
  if (ref != null && String(ref) !== topupRef(topup.id)) return { action: 'mismatch', reason: 'order_ref' }
  const next = mapGatewayStatus(tx.status)
  if (next === null) return { action: 'none', reason: 'unknown_status' }
  if (next === 'approved') {
    const paid = Number(tx.amount)
    if (!Number.isFinite(paid) || paid !== Number(topup.amount)) return { action: 'mismatch', reason: 'amount' }
    if (topup.status !== 'pending' && topup.status !== 'expired') return { action: 'none', reason: 'already_final' }
    return { action: 'credit' }
  }
  if (topup.status !== 'pending') return { action: 'none', reason: 'already_final' }
  if (next === 'pending') return { action: 'none', reason: 'still_pending' }
  return { action: 'mark', status: next }
}

/**
 * Cache TTL sangat kecil (in-memory, per instance serverless) untuk meredam polling berlebihan ke gateway.
 * Best effort: instance lain/cold start punya cache sendiri — cukup untuk menahan banyak tab/klien yang menembak bersamaan.
 */
export function createTtlCache(ttlMs, { now = Date.now, max = 500 } = {}) {
  const m = new Map()
  return {
    get(key) {
      const e = m.get(key)
      if (!e) return undefined
      if (now() - e.at >= ttlMs) { m.delete(key); return undefined }
      return e.value
    },
    set(key, value) {
      if (m.size >= max) { // buang entri tertua supaya memori tidak membengkak
        const oldest = m.keys().next().value
        m.delete(oldest)
      }
      m.set(key, { value, at: now() })
    },
    delete(key) { m.delete(key) },
  }
}
