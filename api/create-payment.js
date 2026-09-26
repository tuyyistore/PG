// POST /api/create-payment  { kind: 'topup', amount: number, method?: string }
// Menggantikan rpc/create_topup_payment (yang dulu bikin "nominal unik" kode 1-99
// untuk dicocokkan ke histori GoBiz). Sekarang DOKU melacak transaksi lewat
// invoice_number sendiri, jadi nominal yang dibayar = nominal asli, tidak perlu kode
// tambahan lagi.
//
// `method` adalah key dari api/_paymentMethods.js (mis. 'qris', 'ovo', 'dana',
// 'shopeepay', 'va_bca', dst). Kalau tidak dikirim, default ke QRIS supaya
// klien lama yang belum kirim `method` tetap jalan seperti biasa.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { requireUser } from './_auth.js'
import { createPayment } from './_doku.js'
import { resolvePaymentMethod, DEFAULT_PAYMENT_METHOD } from './_paymentMethods.js'

const MIN_AMOUNT = 1000        // Rp 1.000
const MAX_AMOUNT = 10000000    // Rp 10.000.000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return

  const { kind, amount, method } = req.body ?? {}
  if (kind !== 'topup') return res.status(400).json({ error: 'kind tidak didukung' })

  const methodKey = method || DEFAULT_PAYMENT_METHOD
  const paymentMethod = resolvePaymentMethod(methodKey)
  if (!paymentMethod) return res.status(400).json({ error: 'Metode pembayaran tidak didukung' })

  const base = Number(amount)
  if (!Number.isFinite(base) || base < MIN_AMOUNT) return res.status(400).json({ error: `Nominal minimal Rp ${MIN_AMOUNT.toLocaleString('id-ID')}` })
  if (base > MAX_AMOUNT) return res.status(400).json({ error: `Nominal maksimal Rp ${MAX_AMOUNT.toLocaleString('id-ID')}` })

  // Bersihkan payment pending lama (>60 menit) milik siapa pun supaya tidak menumpuk.
  await supabaseAdmin.from('payments').update({ status: 'expired' })
    .eq('status', 'pending').lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())

  const { data: payment, error } = await supabaseAdmin.from('payments')
    .insert({ user_id: user.id, kind: 'topup', amount: base, status: 'pending', payload: { amount: base, method: methodKey } })
    .select('*').single()
  if (error) return res.status(500).json({ error: error.message })

  const invoiceNumber = `TOPUP-${payment.id}`
  try {
    const doku = await createPayment({ invoiceNumber, amount: base, dokuTypes: paymentMethod.dokuTypes })
    await supabaseAdmin.from('payments')
      .update({ doku_invoice_number: invoiceNumber, doku_payment_url: doku.url })
      .eq('id', payment.id)
    return res.status(200).json({ id: payment.id, amount: base, method: methodKey, url: doku.url, expiresAt: doku.expiresAt })
  } catch (e) {
    await supabaseAdmin.from('payments').update({ status: 'expired' }).eq('id', payment.id)
    return res.status(502).json({ error: `Gagal membuat pembayaran DOKU (${paymentMethod.label}): ${e.message}` })
  }
}
