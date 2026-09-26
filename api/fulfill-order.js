// POST /api/fulfill-order  { orderIds: number[] }
// Dipanggil klien (best-effort, tidak memblokir alur checkout) tepat setelah
// rpc/buy_with_saldo berhasil. Untuk tiap order milik user yang login, yang
// produknya terhubung ke Preflix (fulfillment_status='pending'), langsung
// pesan ke Preflix supaya dapat serial_number, lalu simpan ke orders.account_data
// (kolom yang sama dipakai admin untuk isi data akun manual — lihat AdminPage).
// Order yang gagal diambil otomatis ditandai 'failed' dan tetap 'aktif' di sisi
// pembeli; admin tinggal isi manual seperti pesanan non-Preflix biasa.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { requireUser } from './_auth.js'
import { orderProduk } from './_preflix.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const user = await requireUser(req, res)
  if (!user) return

  const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(Number).filter(Number.isFinite) : []
  if (orderIds.length === 0) return res.status(400).json({ error: 'orderIds wajib diisi' })

  // Hanya order milik user ini, yang memang menunggu fulfillment otomatis.
  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id, product_id, products(supplier, supplier_product_id)')
    .in('id', orderIds)
    .eq('user_id', user.id)
    .eq('fulfillment_status', 'pending')
  if (error) return res.status(500).json({ error: error.message })

  const results = []
  for (const o of orders ?? []) {
    const supplierProductId = o.products?.supplier_product_id
    if (o.products?.supplier !== 'preflix' || !supplierProductId) {
      await supabaseAdmin.from('orders').update({ fulfillment_status: 'n/a' }).eq('id', o.id)
      continue
    }
    try {
      const stok = await orderProduk(supplierProductId, { email: user.email, catatan: `Order #${o.id} - Warung Tuyyi` })
      await supabaseAdmin.from('orders').update({
        fulfillment_status: 'fulfilled',
        account_data: stok.serial_number ?? '',
        supplier_stock_id: stok.id_stok ? String(stok.id_stok) : null,
      }).eq('id', o.id)
      results.push({ orderId: o.id, status: 'fulfilled' })
    } catch (e) {
      await supabaseAdmin.from('orders').update({
        fulfillment_status: 'failed',
        account_data: `[Gagal ambil otomatis dari Preflix: ${e.message}] Admin harap isi manual.`,
      }).eq('id', o.id)
      results.push({ orderId: o.id, status: 'failed', error: e.message })
    }
  }

  res.status(200).json({ results })
}
