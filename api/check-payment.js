// GET /api/check-payment?paymentId=123
// Dipanggil berkala (polling) oleh QRISModal selama modal terbuka.
// Mengecek histori transaksi GoBiz Merchant, dan kalau nominalnya cocok dengan
// baris `payments` yang masih pending, langsung:
//  - kind='order'  → insert baris ke `orders` dengan status 'aktif' untuk tiap item di payload
//  - kind='topup'  → insert baris ke `topups` (status 'approved') + tambah saldo di `profiles`
// lalu tandai payment sebagai 'paid' — semuanya atomik lewat RPC settle_payment (migration_v5.sql).
import { supabaseAdmin } from './_supabaseAdmin.js'
import { findIncomingPayment } from './_gobiz.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  const paymentId = Number(req.query.paymentId)
  if (!paymentId) return res.status(400).json({ error: 'paymentId wajib diisi' })

  const { data: payment, error } = await supabaseAdmin.from('payments').select('*').eq('id', paymentId).maybeSingle()
  if (error || !payment) return res.status(404).json({ error: 'payment tidak ditemukan' })

  if (payment.status === 'paid') return res.status(200).json({ status: 'paid' })
  if (payment.status === 'expired') return res.status(200).json({ status: 'expired' })

  // Payment kadaluarsa kalau sudah lebih dari 60 menit (nominal unik dilepas biar tidak numpuk).
  const ageMinutes = (Date.now() - new Date(payment.created_at).getTime()) / 60000
  if (ageMinutes > 60) {
    await supabaseAdmin.from('payments').update({ status: 'expired' }).eq('id', paymentId)
    return res.status(200).json({ status: 'expired' })
  }

  // Pengaman: top up yang sah selalu punya selisih nominal bayar − nominal dasar = 1–99
  // (dibuat server lewat RPC create_topup_payment). Tolak baris yang tidak memenuhi.
  if (payment.kind === 'topup') {
    const base = Number(payment.payload?.amount)
    const code = Number(payment.amount) - base
    if (!Number.isInteger(base) || base <= 0 || code < 1 || code > 99) {
      await supabaseAdmin.from('payments').update({ status: 'expired' }).eq('id', paymentId)
      return res.status(400).json({ status: 'expired', error: 'payment tidak valid' })
    }
  }

  let found
  try {
    found = await findIncomingPayment(payment.amount, { sinceMinutes: 60 })
  } catch (e) {
    console.error('Gagal cek histori GoBiz:', e.message)
    return res.status(200).json({ status: 'pending', warning: 'Belum bisa cek GoBiz, coba lagi sebentar.' })
  }

  if (!found) return res.status(200).json({ status: 'pending' })

  // Klaim transaksi + tambah saldo / buat pesanan + tandai paid dalam SATU transaksi
  // database (lihat supabase/migration_v5.sql) — aman walau polling berjalan paralel.
  const { data: outcome, error: settleErr } = await supabaseAdmin.rpc('settle_payment', {
    p_payment_id: paymentId,
    p_tx_id: found.txId,
  })
  if (settleErr) {
    console.error('Gagal settle payment', paymentId, settleErr.message)
    return res.status(200).json({ status: 'pending', warning: 'Pembayaran terdeteksi, sedang diproses...' })
  }

  if (outcome === 'paid' || outcome === 'already_paid') return res.status(200).json({ status: 'paid' })
  if (outcome === 'expired') return res.status(200).json({ status: 'expired' })
  if (outcome === 'not_found') return res.status(404).json({ error: 'payment tidak ditemukan' })
  // 'tx_already_claimed': transaksi GoBiz ini sudah dipakai payment lain → tetap tunggu.
  return res.status(200).json({ status: 'pending' })
}
