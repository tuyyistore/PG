# Ringkasan Perubahan

## v19: Review keamanan, ketahanan, dan kebersihan (terbaru)

**Tindakan manual SEGERA (tidak bisa dilakukan lewat kode):**
- `.env` (berisi `SUPABASE_SERVICE_ROLE_KEY`, `GOPAY_TOKEN`, string QRIS) sempat ikut terbawa di arsip proyek. Anggap semuanya bocor:
  1. Supabase → Project Settings → API → **regenerate service_role key**, lalu perbarui di Vercel dan `bot/.env`.
  2. Cabut/keluar dari sesi GoBiz/GoPay yang tokennya ada di `.env` (token itu sudah tidak dipakai kode sejak v8).
  3. Pertimbangkan merotasi `BETABOTZ_API_KEY` dan `BETABOTZ_WEBHOOK_SECRET` bila `.env` produksi pernah serupa.
  4. Di repo: `git rm --cached .env`; bersihkan history bila repo pernah publik/dibagikan (`git filter-repo --path .env --invert-paths`), lalu aktifkan *secret scanning* GitHub.
  5. CI kini gagal bila ada `.env` ter-commit (selain `.env.example`).
- Supabase → Authentication → Policies: set **Minimum password length = 8** (penegak sebenarnya di pendaftaran).
- Set `SITE_URL` di Vercel ke domain produksi final.
- Jalankan `supabase/migration_v19.sql` (idempoten). `payments` hanya diganti nama jadi `payments_legacy` dan dikunci, tidak dihapus.
- Jalankan `pnpm install` lalu **commit `pnpm-lock.yaml`** (belum ada di repo; CI menampilkan peringatan sampai ada).

**Perubahan kode:**
- **Polling QRIS:** backoff 5 → 30 dtk (`src/lib/polling.ts`), langsung cek saat tab aktif kembali. `btz-status` punya throttle 3 dtk per user+top up selama status pending.
- **Sesi login:** `refresh()` kini hanya satu per satu (request bersamaan menunggu hasil yang sama) dan **tidak lagi menghapus sesi saat jaringan putus/server 5xx**; hanya ditolak server (4xx) yang menghapus sesi.
- **`apiFn`** tahan respons non-JSON (mis. halaman error Vercel) dengan pesan yang ramah.
- **Password minimal 8 karakter** (pendaftaran, reset admin di UI dan `api/admin-reset-password.js`). Login akun lama (6 karakter) tetap jalan.
- **CSP:** script Chaport dipindah ke `public/chaport.js` sehingga `script-src` tidak lagi butuh `'unsafe-inline'` (masih *Report-Only*). Ditambah CSP minimal yang **ditegakkan**: `object-src 'none'; base-uri 'self'; frame-ancestors 'self'`. Untuk menegakkan penuh: buka situs, cek konsol (Chaport, Turnstile, Supabase), sesuaikan host, lalu ganti nama header `Content-Security-Policy-Report-Only` menjadi `Content-Security-Policy`.
- **Handler Betabotz** dipindah ke factory di `api/_btzHandlers.js` (callback/status/cancel) sehingga bisa dites; perilakunya sama, kecuali kegagalan update DB setelah pembatalan di gateway kini dicatat (`mark_cancelled_failed`) dan dipulihkan oleh sinkronisasi berikutnya.
- **Tes:** 16 → 71 tes (`pnpm test`): handler callback/status/cancel, throttle, cache TTL, aturan password, backoff polling, perilaku refresh token (`src/lib/session.test.ts`), serta antrean WA dan klien Cloud API (`bot/*.test.mjs`). Tes pgTAP untuk RPC gateway di `supabase/tests/` (jalankan `supabase test db`).
- **CI:** guard `.env`, install `--frozen-lockfile` bila lockfile ada, lint ESLint (sementara tidak memblokir), `node --check bot/index.mjs`.
- **Dibersihkan:** `src/ProfilePage.tsx` duplikat (v14 mencatat sudah dihapus, ternyata masih ada), `src/imports/3995.png` & `3996.png`, `whatsapp.webp`, file kosong `src/assets/icons/+`. Nama paket `figma-make-app` → `tuyyi-store`. `.env.example` memakai `SITE_URL` produksi.
- **Dokumentasi DB:** banner di `schema.sql` (hanya bootstrap v1), `supabase/README.md` (urutan migrasi, cara snapshot).
- Tipe `any` di `lib/supabase.ts` (`toSession`, `authRaw`, `catch`) diganti tipe eksplisit; riwayat top up di `SaldoPage` memakai tipe `TopupRow` (kolom `unique_code` yang tak dipakai dihapus dari select).
- **Antrean WA (bot):** berjalan terus selama proses hidup (`bot/outbox-core.mjs`), bukan per soket. OTP kedaluwarsa kini dihapus kodenya dari `wa_outbox` walau bot sedang mati (dulu menumpuk sampai bot hidup lagi). `startOutbox` kini `startOutbox({ getSock })`.
- **Cadangan OTP via WhatsApp Cloud API** (`bot/wa-cloud.mjs`): opsional, nonaktif kecuali `WA_CLOUD_*` di `bot/.env` terisi; hanya untuk OTP (template Authentication). Dites dengan fetch palsu, **belum diuji ke server Meta sungguhan**: coba sekali dengan nomor sendiri.

**Belum dikerjakan (butuh akses/keputusan di luar kode):**
- Menyiapkan akun WhatsApp Business Platform + template OTP yang disetujui Meta (kodenya sudah siap, akunnya belum).
- Mengganti sisa `Row = Record<string, any>` (±70 pemakaian) dengan tipe hasil `supabase gen types` (butuh akses proyek Supabase); baru `SaldoPage` yang bertipe.
- Snapshot skema terkini (`supabase db dump`) dan menjalankan tes pgTAP.
- Menegakkan CSP penuh dan menjadikan lint memblokir CI (butuh uji di browser / pembersihan temuan awal).
- `.figma/`, `AGENTS.md`, `CLAUDE.md` dibiarkan (alat Figma Make); hapus bila proyek tak lagi disunting di sana.

## v17: Top up manual dihapus, QR tampil di website (terbaru)

- Jalankan `supabase/migration_v17.sql` (cabut `request_topup`). Halaman Saldo hanya **Bayar via QRIS**; QR dibuat di browser dari `qrisString` (paket `qrcode`). Server mengambil `qrisString` dari detail transaksi bila kosong saat create.

## v16: Top up otomatis Betabotz Paygate

- **Database:** jalankan `supabase/migration_v16.sql` (setelah v15) **bersamaan dengan deploy kode**. Menambah kolom gateway di `topups`, RPC `create_gateway_topup` & `settle_gateway_topup` (hanya `service_role`), dan `cancel_topup` tidak lagi boleh membatalkan top up gateway.
- **Backend (`api/`):** `_betabotz.js` (klien, API key hanya dari env), `_btzLogic.js` + `_btzSync.js` (verifikasi & sinkron, bisa dites), `btz-create-topup`, `btz-callback` (webhook), `btz-status` (fallback), `btz-cancel`.
- **Frontend:** halaman Saldo punya tombol **Bayar via QRIS (otomatis)** + kartu menunggu pembayaran (QR, buka halaman bayar, cek status, batalkan, polling 5 dtk). Top up manual lama tetap ada.
- **Env baru:** `BETABOTZ_API_KEY`, `BETABOTZ_WEBHOOK_SECRET`, `SITE_URL` (lihat `.env.example`). Panduan lengkap: `BETABOTZ.md`.
- **Tes:** `pnpm test` kini menjalankan juga `api/btz.test.js`.

## v15: Bot WhatsApp di Admin (terbaru)

- **Database:** jalankan `supabase/migration_v15.sql` (setelah v14). Tabel `wa_bot` (status, QR, kode pairing, heartbeat) dan `wa_bot_commands`; RPC `admin_wa_bot_command`, `admin_wa_test`, `admin_wa_stats`. Hanya admin yang bisa membaca QR/kode.
- **Admin → Bot WA:** sambungkan nomor lewat **QR** atau **kode pairing**, lihat status/nomor terhubung, mulai ulang, putuskan, kirim pesan uji, dan lihat antrean/terkirim/gagal 24 jam. Status diperbarui otomatis (polling ±2,5 dtk); bila bot tidak mengirim heartbeat >45 dtk tampil "Bot mati".
- **Bot:** `bot/index.mjs` (baru, Baileys). Mengambil perintah dari website, menulis status balik ke `wa_bot`, dan menjalankan `startOutbox` (OTP + notifikasi) setiap tersambung. Sesi di `bot/auth/`, sambung ulang otomatis. Cara pasang: `bot/README.md`. Bot lama yang sudah memanggil `startOutbox(sock)` sendiri sebaiknya diganti dengan bot ini agar tidak ada dua sesi.

## Review v14: top up, verifikasi WhatsApp, admin berskala, tooling

- **Database:** jalankan `supabase/migration_v14.sql` (setelah v13) **bersamaan dengan deploy kode terbaru**. Butuh PostgreSQL 15+ (view `security_invoker`). Bot WA (`bot/wa-outbox.mjs`) juga perlu di-redeploy.
- **Top up:** permintaan pending kedaluwarsa otomatis (default 24 jam, atur di Admin → Pengaturan; ditandai saat ada permintaan baru atau lewat `process_stale_pending_orders()`). User bisa membatalkan permintaannya sendiri. Admin masih bisa menyetujui permintaan yang sudah kedaluwarsa. Setujui top up kini minta konfirmasi dan menampilkan nominal transfer (nominal + kode unik). Nomor WhatsApp admin di halaman Saldo diambil dari pengaturan `admin_wa` (nomor lama jadi cadangan bila kosong).
- **Verifikasi WhatsApp (OTP):** nomor kini hanya bisa diubah lewat kode OTP yang dikirim bot (`request_wa_otp` / `verify_wa_otp`; 6 digit, berlaku 5 menit, maks. 5 percobaan, 5 permintaan per jam per user dan 3 per jam per nomor). Satu nomor terverifikasi hanya untuk satu akun. Notifikasi WA ke user dan bonus referral hanya berlaku untuk nomor terverifikasi. **Akun lama tidak otomatis terverifikasi**: notifikasi WA mereka berhenti sampai mereka verifikasi di Pengaturan. Kode OTP dihapus dari tabel `wa_outbox` setelah terkirim.
- **Admin berskala:** statistik (omzet, jumlah, terlambat, grafik 6 bulan WIB) dihitung di server lewat `admin_stats()`. Omzet kini semua pesanan yang tidak dibatalkan, bukan hanya `aktif`. Tab Pesanan, Pengguna, dan Top Up memakai paginasi, pencarian, dan filter di server (view `admin_orders` / `admin_topups`), tanpa batas 1000/500 baris. Ekspor CSV mengambil semua hasil filter dan menetralkan formula injection (`=`, `+`, `-`, `@`). `AdminPage.tsx` dipecah (40 KB menjadi 20 KB) menjadi `AdminOrders`, `AdminUsers`, `AdminTopups`, dan `adminKit`. Daftar pengguna untuk pratinjau penerima di tab Pesan masih dimuat maks. 1000.
- **Teknis:** keranjang bertahan saat refresh (hanya id produk disimpan; harga dan stok diambil ulang dari katalog). `src/ProfilePage.tsx` duplikat dihapus. Script `pnpm typecheck` dan `pnpm test` (tes `node:test` untuk helper CSV/filter), serta CI GitHub Actions (typecheck, test, build). Header keamanan di `vercel.json`: nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, dan CSP dalam mode **Report-Only**. Buka situs, cek konsol browser untuk pelanggaran CSP (Chaport, Turnstile, Supabase), sesuaikan daftar host, lalu ganti nama header menjadi `Content-Security-Policy` agar ditegakkan.
- **Sengaja belum diubah:** `public/sw.js` (kosong; toko ini tidak berguna offline, baru layak diisi bila web push dibuat) dan migrasi login Google/GitHub ke `supabase-js` PKCE. Yang kedua mengubah sesi semua user dan harus diuji dengan OAuth sungguhan di staging dulu.

## Review v13: keamanan toko, pembatalan + refund, SLA pending (terbaru)

- **Database:** jalankan `supabase/migration_v13.sql` (setelah v12) **bersamaan dengan deploy kode terbaru**. `buy_with_saldo` kini mengembalikan array kosong (bukan error) saat voucher gagal, dan ada status pesanan baru `dibatalkan`.
- **Storage:** foto profil hanya bisa ditulis di folder `<user_id>/` milik sendiri (sebelumnya user mana pun bisa menimpa foto user lain). Bucket dibatasi ke JPG/PNG/WebP/GIF (SVG/HTML ditolak), foto profil maks 2 MB.
- **Voucher:** percobaan gagal dibatasi 10 kali per 10 menit per user (`check_voucher` dan `buy_with_saldo`). Voucher yang gagal saat bayar tidak lagi membuat error, klien melepas voucher dan menampilkan pesan.
- **Referral:** bonus hanya cair bila belanja bersih (setelah voucher) minimal Rp 10.000 (`ref_min` di `buy_with_saldo`). Voucher 100% tidak lagi memicu bonus. Bonus belum ditarik kembali bila pesanan dibatalkan.
- **Batalkan & refund:** Admin → Pesanan → tombol **Batalkan & Refund** memanggil `cancel_order`: saldo dikembalikan, stok dikembalikan (opsional), voucher dikembalikan bila semua pesanan dari pembelian itu dibatalkan, pembeli dapat notifikasi + WhatsApp. Status `dibatalkan` tidak bisa diubah lewat dropdown (dijaga trigger) dan tidak bisa dihidupkan lagi (cegah refund ganda). Pesanan dibatalkan tidak masuk grafik pengeluaran user.
- **SLA pending:** Admin → Pengaturan punya dua angka jam: batas "terlambat" (default 24) dan auto-refund (default 0 = mati). Pesanan terlambat diberi penanda di Admin → Pesanan. Pengingat WA ke admin dan auto-refund dijalankan `process_stale_pending_orders()`; jadwalkan lewat pg_cron (contoh di akhir migration) atau jalankan manual di SQL Editor.
- **Catatan:** `.env` berisi kunci sungguhan ikut terkirim di zip sebelumnya. Rotate `SUPABASE_SERVICE_ROLE_KEY` dan token GoPay, dan jangan sertakan `.env` saat membagikan proyek.

## Review besar v12 (terbaru)

- **Database:** jalankan `supabase/migration_v12.sql` (setelah v11) **bersamaan dengan deploy kode terbaru**. `buy_with_saldo` berganti signature (ada parameter voucher), jadi kode lama tidak cocok dengan DB baru dan sebaliknya.
- **Keamanan:** `.env` dihapus dari repo (pakai `.env.example`). Rotate `SUPABASE_SERVICE_ROLE_KEY` dan token GoPay lama. Admin kini dari tabel `admins` (`is_admin()` dan `api/_auth.js` sama-sama membaca tabel itu).
- **Captcha:** isi `VITE_TURNSTILE_SITE_KEY` di Vercel, lalu aktifkan Captcha (Turnstile) di Supabase → Authentication → Attack Protection dengan secret key-nya. Tanpa env ini captcha tidak tampil.
- **Reset password akun username:** Admin → Pengguna → Detail → Reset password (`api/admin-reset-password.js`, butuh `SUPABASE_SERVICE_ROLE_KEY` di Vercel). WhatsApp kini wajib saat daftar.
- **SEO/PWA:** `noindex` dan blok zoom/copy dihapus, ada OG tags, `sitemap.xml`, `robots.txt` baru, `manifest.webmanifest` dan `sw.js`.
- **Stok & auto-delivery:** produk bisa dicentang "Kirim otomatis" (isi stok di Admin → Stok, satu baris satu akun) atau diberi angka stok. Pembelian manual sekarang berstatus `pending` sampai admin mengisi data akun.
- **Voucher:** Admin → Voucher, dipakai di Checkout. Satu voucher satu kali per user.
- **Referral:** link `?ref=USR-XXXX` di Pengaturan. Bonus Rp 2.000 untuk pengajak setelah pembelian pertama teman (ubah `ref_bonus` di fungsi `buy_with_saldo`).
- **Top up:** user buat permintaan dengan kode unik 1–99, transfer, konfirmasi via WA, admin setujui di Admin → Top Up. Isi info pembayaran di Admin → Pengaturan. Bukan otomatis penuh (belum ada payment gateway).
- **Notifikasi WhatsApp:** trigger database mengisi tabel `wa_outbox`. Jalankan `startOutbox(sock)` dari `bot/wa-outbox.mjs` di bot Baileys-mu untuk mengirimnya.
- **Admin:** audit log, omzet 6 bulan, filter tanggal, ekspor CSV pesanan/pengguna, batas muat 1000 baris.
- **Lainnya:** pencarian produk, pesan error checkout asli dari server, struk cetak per pesanan.

## Notifikasi & pesan admin, ID pengguna (terbaru)

- **Database:** jalankan `supabase/migration_v11.sql` (setelah v10) di Supabase → SQL Editor. Tidak ada env baru.
  Isinya: kolom `profiles.user_code`, tabel `notifications` + `notification_batches`, dan fungsi
  `admin_send_notification`, `notifications_mark_read`. **Jalankan bersamaan dengan deploy kode terbaru.**
- **ID pengguna:** tiap akun punya ID unik `USR-XXXXXXXX` (dibuat otomatis oleh trigger, tidak bisa diubah
  dari client, akun lama otomatis mendapat ID). Tampil di **Pengaturan** (tombol Salin ID) dan di
  **Admin → Pengguna** (daftar + Detail). Pencarian pengguna di admin kini bisa lewat email, ID, atau username.
- **Tombol lonceng notifikasi** di header (`src/components/NotificationBell.tsx`): badge jumlah belum dibaca,
  panel daftar pesan, tandai dibaca (per pesan / semua), hapus pesan. Pesan baru dicek tiap ±45 detik
  dan memunculkan toast. User **hanya** bisa membaca notifikasi miliknya sendiri (Row Level Security).
- **Admin → tab Pesan** (`src/components/AdminMessages.tsx`):
  - **Satu pengguna:** isi email, ID pengguna (`USR-…`), UUID, atau `@username`. Ada pratinjau pengguna yang cocok.
    Tombol **Kirim Pesan** juga ada di Detail Pengguna (tujuan terisi otomatis).
  - **Semua pengguna:** ada dialog konfirmasi. Akun admin pengirim tidak ikut menerima.
  - **Riwayat pesan:** 50 pengiriman terakhir; tombol hapus **menarik** pesan dari notifikasi penerima.
- **Tipe notifikasi dirapikan** (`src/lib/notifications.ts`, satu sumber untuk label/ikon/warna):
  `info` · `pesanan` · `saldo` · `promo` · `peringatan`. Daftar yang sama dijaga oleh check constraint di database.
  Menambah tipe baru: ubah `NOTIF_TYPES` + `NOTIF_META` dan constraint `type` di database.
- Catatan: pesan "semua pengguna" disalin per penerima saat dikirim, jadi pengguna yang mendaftar sesudahnya
  tidak menerima pesan lama.

## Penghapusan DOKU & Preflix (terbaru)

- **DOKU dihapus:** `api/_doku.js`, `api/_paymentMethods.js`, `api/create-payment.js`,
  `api/check-payment.js`, komponen `QRISModal` & `PaymentMethods`, dan semua logo metode
  pembayaran. Halaman **Saldo** kini hanya menampilkan saldo + riwayat top up, dengan info
  bahwa top up otomatis tidak tersedia (admin masih bisa **Tambah Saldo** dari Admin → Pengguna).
- **Preflix dihapus:** `api/_preflix.js`, `api/admin-sync-preflix.js`, `api/fulfill-order.js`,
  tombol "Sync dari Preflix", badge Preflix, peringatan auto-fulfillment, dan pemanggilan
  `fulfill-order` saat checkout. Data akun pesanan kini murni diisi manual oleh admin.
- **Database:** jalankan `supabase/migration_v9.sql` (setelah v8). Ini menghapus semua produk
  ber-`supplier='preflix'`, membuang kolom/tabel/fungsi Preflix & DOKU, dan memperbarui
  `buy_with_saldo`. **Jalankan bersamaan dengan deploy kode terbaru.**
- **Env Vercel yang bisa dihapus:** `DOKU_CLIENT_ID`, `DOKU_SECRET_KEY`, `DOKU_IS_PRODUCTION`,
  `PREFLIX_ID_USER`, `PREFLIX_KEY_USER`.
- Catatan: bagian lama di bawah ini menyebut DOKU/Preflix sebagai riwayat perubahan saja.

## Metode pembayaran DOKU baru (tidak perlu migration)

Halaman **Top Up Saldo** sekarang tidak lagi hanya QRIS — pengguna bisa pilih:
- **QRIS** (default, seperti sebelumnya)
- **E-wallet langsung**: OVO, DANA, ShopeePay
- **Virtual Account**: BCA, Mandiri, BNI, BRI

Semua metode diproses lewat DOKU Checkout API yang sama (`payment.payment_method_types`),
tidak ada kolom/tabel baru di database — jadi **tidak perlu jalankan migration apa pun**
untuk perubahan ini. Yang berubah:
- `api/_paymentMethods.js` — **baru**, daftar metode → kode `payment_method_types` DOKU.
  Tambah metode lain yang didukung DOKU (LinkAja, Alfamart/Indomaret, Akulaku, dst.) cukup
  tambah entry di sini.
- `api/_doku.js` — `createQrisPayment()` diganti `createPayment({ dokuTypes })` yang generik
  (alias lama masih ada supaya tidak patah kalau ada kode lain yang mengimpornya).
- `api/create-payment.js` — terima field baru `method` (opsional, default `'qris'`).
- `src/components/PaymentMethods.tsx` — daftar `PAYMENT_METHOD_OPTIONS` + badge ikon untuk
  metode yang belum ada logo SVG-nya (VA BCA/BNI/BRI, ShopeePay).
- `src/pages/SaldoPage.tsx` & `src/components/QRISModal.tsx` — UI pilih metode pembayaran,
  dan modal pembayaran menyesuaikan judul/instruksi sesuai metode yang dipilih.

## ⚠️ Wajib dijalankan dulu sebelum deploy

0. `supabase/migration_v8.sql` — **baru**, mengganti payment gateway QRIS dari GoBiz
   (polling histori transaksi GoPay Merchant + nominal unik kode 1-99) ke **DOKU**
   (Checkout API, dilacak lewat `invoice_number` sendiri — nominal unik tidak diperlukan
   lagi). Hapus RPC `create_topup_payment` (digantikan `api/create-payment.js`), ganti
   `gobiz_claimed_tx`/`gobiz_session` jadi `doku_claimed_tx`. **Wajib jalan bersamaan
   dengan deploy kode terbaru**, dan isi environment variable Vercel `DOKU_CLIENT_ID` +
   `DOKU_SECRET_KEY` (dari DOKU Back Office) — tanpa ini tombol "Bayar via QRIS" gagal.
   Hapus juga env lama yang sudah tidak dipakai: `GOPAY_TOKEN`, `GOPAY_MERCHANT_ID`,
   `VITE_QRIS_STATIC_STRING`.

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

## 11. URL per halaman, struktur file, grafik (tanpa migration)
- **React Router:** tiap halaman punya URL sendiri — `/`, `/produk`, `/pesanan`, `/topup`,
  `/checkout`, `/pengaturan`, `/admin`. Bisa di-refresh, di-bookmark, dan tombol kembali browser
  berpindah antar-halaman. Path tak dikenal → Dashboard; `/admin` untuk non-admin → Dashboard;
  `/checkout` dengan keranjang kosong → Produk. Admin tetap langsung ke Dashboard Admin saat
  membuka `/`. (`vercel.json` sudah me-rewrite semua path ke `index.html`.)
- **`App.tsx` dipecah** (dari ±1.300 jadi ±190 baris):
  `src/pages/*` (tiap halaman, termasuk `AdminPage.tsx`), `src/components/*` (Layout, Brand,
  Orders, QRISModal, PaymentMethods, SpendingChart), `src/types.ts`, `src/lib/mappers.ts`.
  Isi fungsi tidak diubah — hanya dipindah.
- **Grafik pengeluaran** 6 bulan terakhir di Dashboard (bulan ini + total, tooltip per bulan).

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
