// GET /api/check-payment?paymentId=123
// Dipanggil berkala (polling) oleh QRISModal selama modal terbuka.
// Mengecek histori transaksi GoBiz Merchant, dan kalau nominalnya cocok dengan
// baris `payments` yang masih pending, langsung:
//  - kind='order'  → insert baris ke `orders` dengan status 'aktif' untuk tiap item di payload
//  - kind='topup'  → insert baris ke `topups` (status 'approved') + tambah saldo di `profiles`
// lalu tandai payment sebagai 'paid'.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { findIncomingPayment, claimPayment } from './_gobiz.js'

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

  let found
  try {
    found = await findIncomingPayment(payment.amount, { sinceMinutes: 60 })
  } catch (e) {
    console.error('Gagal cek histori GoBiz:', e.message)
    return res.status(200).json({ status: 'pending', warning: 'Belum bisa cek GoBiz, coba lagi sebentar.' })
  }

  if (!found) return res.status(200).json({ status: 'pending' })

  // Tandai transaksi ini terpakai dulu (cegah request polling paralel klaim dua kali).
  await claimPayment(found.txId, paymentId, payment.amount)

  if (payment.kind === 'order') {
    const items = Array.isArray(payment.payload) ? payment.payload : []
    if (items.length) {
      await supabaseAdmin.from('orders').insert(
        items.map(i => ({ ...i, user_id: payment.user_id, status: 'aktif' }))
      )
    }
  } else if (payment.kind === 'topup') {
    const baseAmount = Number(payment.payload?.amount ?? payment.amount)
    await supabaseAdmin.from('topups').insert({ user_id: payment.user_id, amount: baseAmount, status: 'approved' })
    const { data: prof } = await supabaseAdmin.from('profiles').select('saldo').eq('id', payment.user_id).maybeSingle()
    await supabaseAdmin.from('profiles').update({ saldo: Number(prof?.saldo ?? 0) + baseAmount }).eq('id', payment.user_id)
  }

  await supabaseAdmin.from('payments').update({ status: 'paid', matched_tx_id: found.txId }).eq('id', paymentId)

  return res.status(200).json({ status: 'paid' })
}
