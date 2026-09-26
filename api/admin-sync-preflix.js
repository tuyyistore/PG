// POST /api/admin-sync-preflix
// Khusus admin. Menarik seluruh kategori & produk dari Preflix (termasuk yang stok
// kosong, supaya kelihatan di Admin walau tidak aktif dijual), lalu upsert ke tabel
// `categories` & `products` lokal. Produk yang disinkron ditandai supplier='preflix'
// + supplier_product_id, jadi tidak menimpa produk manual yang dibuat admin sendiri.
// Kolom lain (tagline, features, badge, logo_url, dst.) TIDAK disentuh di sini supaya
// kustomisasi admin tetap ada — hanya nama, kategori, harga, status aktif & stok yang
// diperbarui mengikuti data terbaru dari Preflix.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { requireAdmin } from './_auth.js'
import { getAllProduct } from './_preflix.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const admin = await requireAdmin(req, res)
  if (!admin) return

  let preflix
  try {
    preflix = await getAllProduct()
  } catch (e) {
    return res.status(502).json({ error: `Gagal mengambil data dari Preflix: ${e.message}` })
  }

  const kategoriList = Array.isArray(preflix?.data) ? preflix.data : []
  if (kategoriList.length === 0) return res.status(200).json({ synced: 0, categories: 0, message: 'Tidak ada data dari Preflix.' })

  // 1) Pastikan setiap kategori Preflix ada di tabel categories lokal.
  const categoryNames = [...new Set(kategoriList.map(k => k.nama_kategori).filter(Boolean))]
  if (categoryNames.length > 0) {
    const { data: existing } = await supabaseAdmin.from('categories').select('name')
    const existingNames = new Set((existing ?? []).map(c => c.name))
    const toInsert = categoryNames.filter(n => !existingNames.has(n)).map((name, i) => ({ name, sort: existingNames.size + i }))
    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('categories').insert(toInsert)
      if (error) return res.status(500).json({ error: `Gagal menyimpan kategori: ${error.message}` })
    }
  }

  // 2) Upsert produk, dikunci oleh (supplier, supplier_product_id).
  const rows = kategoriList.flatMap(k =>
    (k.produk ?? []).map(p => ({
      supplier: 'preflix',
      supplier_product_id: String(p.id_produk),
      supplier_stock: Number(p.stok ?? 0),
      name: p.nama_produk,
      category: k.nama_kategori,
      price: Number(p.harga),
      active: Number(p.stok ?? 0) > 0,
    }))
  )
  if (rows.length === 0) return res.status(200).json({ synced: 0, categories: categoryNames.length })

  const { data: upserted, error: upsertErr } = await supabaseAdmin
    .from('products')
    .upsert(rows, { onConflict: 'supplier,supplier_product_id' })
    .select('id')
  if (upsertErr) return res.status(500).json({ error: `Gagal sinkron produk: ${upsertErr.message}` })

  res.status(200).json({ synced: upserted?.length ?? rows.length, categories: categoryNames.length })
}
