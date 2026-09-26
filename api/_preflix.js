// Wrapper tipis di atas H2H API PREFLIX (dokumentasi: https://h2h.preflix.my.id/app/doc/).
// id_user & key_user WAJIB diisi lewat Environment Variables Vercel (PREFLIX_ID_USER,
// PREFLIX_KEY_USER) — jangan pernah hardcode kredensial asli di sini atau di kode
// yang ikut ter-bundle ke browser (kunci ini hanya boleh dipakai di folder /api).
const BASE_URL = 'https://h2h.preflix.my.id/app/'
const ID_USER = process.env.PREFLIX_ID_USER || 'PLACEHOLDER_ID_USER'
const KEY_USER = process.env.PREFLIX_KEY_USER || 'PLACEHOLDER_KEY_USER'

async function call(koneksi, params = {}) {
  const body = new URLSearchParams({ koneksi, id_user: ID_USER, key_user: KEY_USER, ...params })
  const r = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch {
    throw new Error(`Respons Preflix bukan JSON (koneksi=${koneksi}): ${text.slice(0, 200)}`)
  }
  if (data?.status === 'error' || data?.status === 'failed') {
    throw new Error(data.message || `Preflix menolak permintaan (koneksi=${koneksi})`)
  }
  return data
}

export const getKategori = () => call('get_kategori')
export const getReadyProduct = () => call('get_ready_product')
export const getAllProduct = () => call('get_all_product')
export const getProdukByKategori = (id_kategori) => call('get_produk', { id_kategori })
export const getStok = () => call('get_stok')
export const getStokById = (id_produk) => call('get_stok_by_id', { id_produk })
export const getRiwayat = () => call('get_riwayat')

/**
 * Lakukan pemesanan produk ke Preflix. Mengembalikan objek stok yang didapat
 * ({ id_stok, id_produk, serial_number, buyer, harga }), sudah di-parse dari
 * field `data` (yang dikirim Preflix sebagai string JSON, bukan objek langsung).
 */
export async function orderProduk(id_produk, { durasi, email, catatan } = {}) {
  const res = await call('order', {
    id_produk,
    ...(durasi ? { durasi } : {}),
    ...(email ? { email } : {}),
    ...(catatan ? { catatan } : {}),
  })
  if (res?.status !== 'success') throw new Error(res?.message || 'Order ke Preflix gagal')
  try {
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  } catch {
    throw new Error('Gagal membaca data stok dari respons Preflix')
  }
}
