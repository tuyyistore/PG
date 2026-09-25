# Ringkasan Perubahan

## ⚠️ Wajib dijalankan dulu sebelum deploy
Buka **Supabase → SQL Editor**, jalankan berurutan (sekali saja, kalau belum pernah):
1. `supabase/migration_v2.sql` — menambahkan kolom/tabel WhatsApp, email kontak, data akun
   pesanan, kategori, logo produk, fungsi admin tambah/refund saldo, dan bucket Storage
   (limit 10 MB per file).
2. `supabase/migration_v3.sql` — **baru**, menambahkan kolom `logo_url` di tabel `orders`
   supaya foto produk yang dibeli ikut tampil di Dashboard/Pesanan Saya, bukan cuma di
   halaman Produk.

3. `supabase/migration_v4.sql` — **baru (keamanan)**, nominal unik QRIS top up sekarang dibuat
   di server lewat RPC `create_topup_payment`. Klien tidak bisa lagi INSERT langsung ke tabel
   `payments`. **Wajib dijalankan bersamaan dengan deploy kode terbaru** — kalau kode baru
   di-deploy tanpa migration ini, tombol "Bayar via QRIS" akan gagal.

4. `supabase/migration_v5.sql` — **baru (keamanan)**, konfirmasi pembayaran QRIS jadi atomik
   (saldo/pesanan tidak bisa dobel), pengguna tidak bisa lagi mengubah kolom `saldo` sendiri,
   pembelian pakai saldo tidak bisa membuat saldo minus, dan pengguna tidak bisa lagi membuat
   baris `orders` / `topups` / `payments` sendiri lewat API. **Wajib dijalankan bersamaan
   dengan deploy kode terbaru** (`api/check-payment.js` sekarang memanggil RPC `settle_payment`).

Kalau database masih baru (belum pernah dipakai sama sekali), jalankan urutan lengkap:
`schema.sql` → `migration_v2.sql` → `migration_v3.sql` → `migration_v4.sql` → `migration_v5.sql`. **`seed.sql` sekarang kosong** (tidak
ada lagi 10 produk contoh) — semua produk & kategori 100% diisi manual lewat Dashboard Admin.

## 10. Peningkatan pengalaman pengguna (tanpa migration)
- **Notifikasi toast** untuk aksi berhasil (simpan pengaturan, tambah ke keranjang, pembelian
  berhasil, salin ID/nominal, aksi admin) — tidak lagi menggeser isi halaman.
- **Skeleton loading** di Dashboard, Produk, Pesanan Saya, Riwayat Top Up, dan Dashboard Admin.
- **QRIS:** hitung mundur masa berlaku (60 menit) + tombol salin nominal.
- **Riwayat top up** (10 terakhir) di halaman Top Up Saldo.
- **Pesanan Saya:** pencarian (ID / nama produk / kategori) + filter status dengan jumlah.
- **Dialog konfirmasi** menggantikan `confirm()` bawaan browser saat admin menghapus produk/kategori.
- Judul tab mengikuti halaman aktif, favicon baru, dan `@types/qrcode` (type check bersih).

## 9. Saldo tidak bisa dobel atau dimanipulasi
- **Konfirmasi QRIS atomik:** `api/check-payment.js` sekarang memanggil RPC `settle_payment` yang
  mengunci baris payment, mengklaim transaksi GoBiz, menambah saldo (atau membuat pesanan), dan
  menandai payment `paid` dalam satu transaksi database. Sebelumnya dua polling bersamaan bisa
  sama-sama menambah saldo.
- **Kolom `saldo` terkunci:** pengguna hanya boleh mengubah nama, foto, WhatsApp, dan email
  kontak di profilnya. Sebelumnya siapa pun bisa mengubah saldonya sendiri lewat API.
- **Beli pakai saldo:** pengecekan & pemotongan saldo digabung dalam satu UPDATE, jadi dua
  pembelian bersamaan tidak bisa membuat saldo minus. Ditambah constraint `saldo >= 0`.
- **Tidak ada lagi baris palsu:** policy INSERT klien di `orders` dan `topups` dihapus, dan hak
  INSERT/DELETE ke `orders`, `topups`, `payments` dicabut dari pengguna. Pesanan & top up hanya
  dibuat oleh fungsi server. Top up `pending` lama sebaiknya dicek dulu sebelum disetujui
  (query contoh ada di akhir `migration_v5.sql`).

## 8. Nominal unik QRIS dibuat di server
- Sebelumnya browser membuat kode unik 1–99 sendiri dan menulis langsung ke tabel `payments`,
  sehingga nominal dasar (`payload.amount`) bisa dimanipulasi — misalnya bayar Rp 10.001 tapi
  saldo yang masuk Rp 1.000.000.
- Sekarang browser hanya mengirim nominal dasar ke RPC `create_topup_payment`. Server
  memvalidasi nominal (Rp 1.000 – Rp 10.000.000), memilih kode 1–99 yang belum dipakai payment
  pending lain (dikunci supaya request bersamaan tidak bentrok), lalu menyimpan payment.
- `api/check-payment.js` juga menolak payment top up yang selisih nominalnya bukan 1–99.

## 7. Pembaruan sesi ini
- **Pencarian pesanan (Admin → Pesanan):** ada kolom pencarian di atas daftar pesanan —
  ketik ID pesanan (`ORD-12` atau `12`), nama produk, atau email pembeli untuk memfilter,
  jadi admin tidak perlu scroll manual di antara banyak riwayat. Tiap pesanan juga punya
  ID yang jelas terlihat + tombol **Salin ID**.
- **Tombol Beli Produk / Top Up dipindah ke atas** Dashboard (user maupun admin), tepat di
  bawah judul "Dashboard" dan di atas kartu Total Produk Dibeli/Pending/Dibatalkan/Saldo.
- **Thumbnail produk pakai foto asli:** halaman Produk, Dashboard, Pesanan Saya, Detail
  Pesanan, dan Checkout sekarang menampilkan foto/logo yang diunggah admin sebagai
  thumbnail produk (bukan ikon bawaan template lagi). Kalau produk belum punya foto,
  tampil kotak ikon generik netral.
- **Form Tambah/Edit Produk disederhanakan:** pilihan **Ikon** dan **Warna** dihapus total
  dari form — cukup unggah **foto/logo produk**, itu yang jadi identitas visual produk.
- **Bug kategori produk diperbaiki:** halaman Produk (yang dilihat user) sekarang mengambil
  daftar tab kategori langsung dari tabel `categories` di database, sama seperti dropdown
  di form admin. Sebelumnya tab kategori di halaman Produk masih hardcode
  (`Semua/VPS/Panel/Jasa`) di kode, jadi kategori baru yang ditambah admin tidak pernah
  muncul sebagai filter. Sekarang begitu admin menambah/menghapus kategori, tab di halaman
  Produk otomatis ikut berubah.
- **100% murni database:** 10 produk contoh bawaan (VPS Starter, VPS Pro, dst.) sudah
  dihapus total dari kode (`src/App.tsx`) dan dari `supabase/seed.sql`. Tidak ada lagi
  tombol "Impor produk bawaan" di Admin. Kalau tabel `products` kosong, halaman Produk akan
  benar-benar kosong sampai admin menambahkan produk sendiri.

## 1. Tombol Pengaturan (ikon gear) sekarang berfungsi
- Membuka halaman **Pengaturan**: ubah nama, unggah foto profil, isi nomor WhatsApp, dan email
  kontak untuk pembelian.
- Email & WhatsApp ini otomatis ditampilkan/terisi di halaman Checkout dan disalin ke setiap
  pesanan, supaya admin tahu ke mana harus mengirim data akun.

## 2. Tombol/gestur "Kembali" diperbaiki
- Navigasi antar menu sekarang memakai History API (pushState/popstate). Menekan tombol kembali
  di browser/perangkat akan berpindah ke halaman sebelumnya di dalam app, bukan keluar ke menu
  login.

## 3. Pencarian email pengguna (Admin → Pengguna)
- Baris pengguna dibuat ringkas (hanya email) + tombol **Detail** singkat.
- Modal Detail menampilkan: tanggal bergabung, saldo sekarang, nomor HP/WhatsApp, dengan aksi
  **Tambah Saldo** dan **Refund / Kembalikan** (masuk/keluar langsung dari saldo user).

## 4. Halaman produk yang sudah dibeli
- Judul kartu di Dashboard diganti dari "Status Server" → **"Produk Saya"**.
- Badge teks "aktif" pada Dashboard & Pesanan Saya diganti jadi tombol **"Lihat Detail"** yang
  membuka data akun/info penting yang diinput admin untuk pesanan tersebut.
- Admin bisa mengisi "Data akun" ini dari tab **Pesanan** di dashboard admin.

## 5. Kategori & logo produk (Admin → Produk)
- Bagian **Kelola Kategori**: tambah/hapus kategori, otomatis muncul di dropdown form produk.
- Form produk punya input **unggah logo** (gambar), menggantikan tampilan ikon bila diisi.

## 6. Batas ukuran file
- Bucket Storage `avatars` dan `products` dinaikkan ke 10 MB per file (lihat migration_v2.sql).
- Validasi sisi klien juga membatasi unggahan ke 10 MB agar pesan errornya jelas sebelum upload.
