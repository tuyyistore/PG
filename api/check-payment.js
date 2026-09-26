// GET /api/check-payment?paymentId=123
// Dipanggil berkala (polling) oleh QRISModal selama modal terbuka.
// Mengecek status transaksi ke DOKU Check Status API lewat invoice_number yang
// dibuat di api/create-payment.js, dan kalau statusnya SUCCESS, langsung:
//  - kind='order'  → insert baris ke `orders` dengan status 'aktif' untuk tiap item di payload
//  - kind='topup'  → insert baris ke `topups` (status 'approved') + tambah saldo di `profiles`
// lalu tandai payment sebagai 'paid' — semuanya atomik lewat RPC settle_payment (migration_v8.sql).
import { supabaseAdmin } from './_supabaseAdmin.js'
import { checkPaymentStatus } from './_doku.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  const paymentId = Number(req.query.paymentId)
  if (!paymentId) return res.status(400).json({ error: 'paymentId wajib diisi' })

  const { data: payment, error } = await supabaseAdmin.from('payments').select('*').eq('id', paymentId).maybeSingle()
  if (error || !payment) return res.status(404).json({ error: 'payment tidak ditemukan' })

  if (payment.status === 'paid') return res.status(200).json({ status: 'paid' })
  if (payment.status === 'expired') return res.status(200).json({ status: 'expired' })

  // Payment kadaluarsa kalau sudah lebih dari 60 menit.
  const ageMinutes = (Date.now() - new Date(payment.created_at).getTime()) / 60000
  if (ageMinutes > 60) {
    await supabaseAdmin.from('payments').update({ status: 'expired' }).eq('id', paymentId)
    return res.status(200).json({ status: 'expired' })
  }

  if (!payment.doku_invoice_number) return res.status(200).json({ status: 'pending' })

  let result
  try {
    result = await checkPaymentStatus(payment.doku_invoice_number)
  } catch (e) {
    console.error('Gagal cek status DOKU:', e.message)
    return res.status(200).json({ status: 'pending', warning: 'Belum bisa cek DOKU, coba lagi sebentar.' })
  }

  // DOKU Checkout mengizinkan pembeli ganti metode/coba lagi kalau satu percobaan gagal,
  // jadi status FAILED dari satu percobaan tidak berarti transaksinya final gagal.
  if (result.status !== 'SUCCESS') return res.status(200).json({ status: 'pending' })

  // Klaim transaksi + tambah saldo / buat pesanan + tandai paid dalam SATU transaksi
  // database (lihat supabase/migration_v8.sql) — aman walau polling berjalan paralel.
  const { data: outcome, error: settleErr } = await supabaseAdmin.rpc('settle_payment', {
    p_payment_id: paymentId,
    p_tx_id: result.txId || payment.doku_invoice_number,
  })
  if (settleErr) {
    console.error('Gagal settle payment', paymentId, settleErr.message)
    return res.status(200).json({ status: 'pending', warning: 'Pembayaran terdeteksi, sedang diproses...' })
  }

  if (outcome === 'paid' || outcome === 'already_paid') return res.status(200).json({ status: 'paid' })
  if (outcome === 'expired') return res.status(200).json({ status: 'expired' })
  if (outcome === 'not_found') return res.status(404).json({ error: 'payment tidak ditemukan' })
  // 'tx_already_claimed': transaksi DOKU ini sudah dipakai payment lain → tetap tunggu.
  return res.status(200).json({ status: 'pending' })
}
