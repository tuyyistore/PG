// POST /api/create-payment  { kind: 'topup', amount: number }
// Menggantikan rpc/create_topup_payment (yang dulu bikin "nominal unik" kode 1-99
// untuk dicocokkan ke histori GoBiz). Sekarang DOKU melacak transaksi lewat
// invoice_number sendiri, jadi nominal yang dibayar = nominal asli, tidak perlu kode
// tambahan lagi.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { requireUser } from './_auth.js'
import { createQrisPayment } from './_doku.js'

const MIN_AMOUNT = 1000        // Rp 1.000
const MAX_AMOUNT = 10000000    // Rp 10.000.000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return

  const { kind, amount } = req.body ?? {}
  if (kind !== 'topup') return res.status(400).json({ error: 'kind tidak didukung' })

  const base = Number(amount)
  if (!Number.isFinite(base) || base < MIN_AMOUNT) return res.status(400).json({ error: `Nominal minimal Rp ${MIN_AMOUNT.toLocaleString('id-ID')}` })
  if (base > MAX_AMOUNT) return res.status(400).json({ error: `Nominal maksimal Rp ${MAX_AMOUNT.toLocaleString('id-ID')}` })

  // Bersihkan payment pending lama (>60 menit) milik siapa pun supaya tidak menumpuk.
  await supabaseAdmin.from('payments').update({ status: 'expired' })
    .eq('status', 'pending').lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  const { data: payment, error } = await supabaseAdmin.from('payments')
    .insert({ user_id: user.id, kind: 'topup', amount: base, status: 'pending', payload: { amount: base } })
    .select('*').single()
  if (error) return res.status(500).json({ error: error.message })

  const invoiceNumber = `TOPUP-${payment.id}`
  try {
    const doku = await createQrisPayment({ invoiceNumber, amount: base })
    await supabaseAdmin.from('payments')
      .update({ doku_invoice_number: invoiceNumber, doku_payment_url: doku.url })
      .eq('id', payment.id)
    return res.status(200).json({ id: payment.id, amount: base, url: doku.url, expiresAt: doku.expiresAt })
  } catch (e) {
    await supabaseAdmin.from('payments').update({ status: 'expired' }).eq('id', payment.id)
    return res.status(502).json({ error: `Gagal membuat pembayaran DOKU: ${e.message}` })
  }
}
