// Wrapper tipis di atas modul https://github.com/kavionn/gobiz-payment.
//
// PENTING: gobiz-payment didesain untuk dijalankan di proses Node yang persisten
// (nyimpen sesi ke file lokal .gopay_cache.json). Di Vercel (serverless, stateless,
// tanpa disk permanen) kita ganti penyimpanan sesi itu ke tabel Supabase
// `gobiz_session`, dan SELALU login pakai mode "bypass token" (tanpa OTP) —
// login OTP interaktif tidak mungkin jalan di dalam function serverless.
//
// Token awal didapat SEKALI lewat script lokal `scripts/login-gobiz.mjs` (lihat
// file itu), lalu disimpan manual ke tabel gobiz_session (atau env GOPAY_TOKEN /
// GOPAY_MERCHANT_ID sebagai seed pertama kali).
import GoPayMerchant from 'gobiz-payment'
import { supabaseAdmin } from './_supabaseAdmin.js'

async function loadSession() {
  const { data } = await supabaseAdmin.from('gobiz_session').select('token, merchant_id').eq('id', 1).maybeSingle()
  if (data?.token && data?.merchant_id) return { token: data.token, merchantId: data.merchant_id }
  // Seed pertama kali dari environment variable (hasil scripts/login-gobiz.mjs)
  if (process.env.GOPAY_TOKEN && process.env.GOPAY_MERCHANT_ID) {
    return { token: process.env.GOPAY_TOKEN, merchantId: process.env.GOPAY_MERCHANT_ID }
  }
  throw new Error('Sesi GoBiz belum diatur. Jalankan scripts/login-gobiz.mjs lalu simpan hasilnya ke tabel gobiz_session.')
}

async function saveSession(token, merchantId) {
  await supabaseAdmin.from('gobiz_session').upsert({ id: 1, token, merchant_id: merchantId, updated_at: new Date().toISOString() })
}

let merchantSingleton = null

/** Ambil instance GoPayMerchant yang siap pakai (token dari Supabase, bukan file lokal). */
export async function getMerchant() {
  if (merchantSingleton) return merchantSingleton
  const { token, merchantId } = await loadSession()
  merchantSingleton = new GoPayMerchant({ token, merchantId })
  await merchantSingleton.init()
  // Kalau token sempat di-refresh otomatis oleh library saat init/permintaan berikutnya,
  // kita simpan lagi ke Supabase supaya invocation berikutnya tidak perlu refresh ulang.
  if (merchantSingleton.token && merchantSingleton.token !== token) {
    await saveSession(merchantSingleton.token, merchantSingleton.merchantId ?? merchantId)
  }
  return merchantSingleton
}

function parseRupiah(displayedText) {
  // "Rp 50.085" / "Rp50085" → 50085
  return Number(String(displayedText).replace(/[^0-9]/g, ''))
}

/**
 * Cari transaksi masuk (payin) dengan nominal persis `amount`, dalam beberapa menit
 * terakhir, yang belum pernah diklaim sebelumnya.
 * Return: { txId, amount, time, raw } atau null.
 */
export async function findIncomingPayment(amount, { sinceMinutes = 60 } = {}) {
  const merchant = await getMerchant()
  const result = await merchant.getHistory({ days: 1, size: 30 })
  if (!result?.status) return null

  const sinceMs = Date.now() - sinceMinutes * 60 * 1000
  for (const tx of result.data?.histories ?? []) {
    if (tx.type !== 'payin') continue
    if (parseRupiah(tx.amount?.displayed_text) !== amount) continue
    const t = new Date(tx.time).getTime()
    if (!Number.isNaN(t) && t < sinceMs) continue

    const txId = String(tx.raw?.id ?? tx.raw?.trx_id ?? tx.raw?.transaction_id ?? tx.raw?.reference_no ?? `${tx.time}-${amount}`)
    const { data: already } = await supabaseAdmin.from('gobiz_claimed_tx').select('tx_id').eq('tx_id', txId).maybeSingle()
    if (already) continue

    return { txId, amount, time: tx.time, raw: tx.raw }
  }
  return null
}

export async function claimPayment(txId, paymentId, amount) {
  await supabaseAdmin.from('gobiz_claimed_tx').insert({ tx_id: txId, payment_id: paymentId, amount })
}
