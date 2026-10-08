# Bot WhatsApp TUYYI STORE

Satu proses Node di VPS: tersambung ke WhatsApp (Baileys), mengirim antrean `wa_outbox`
(OTP + notifikasi pesanan/saldo), dan dikontrol dari **Admin → Bot WA**.

## Pasang (sekali)
1. Supabase → SQL Editor: jalankan `supabase/migration_v15.sql` (setelah v14).
2. Di VPS (Node 20.6+, perlu `git` untuk dependensi Baileys):
   ```
   cd bot
   cp .env.example .env   # isi VITE_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
   npm install
   npm start              # atau: pm2 start index.mjs --name tuyyi-wa --node-args="--env-file=.env"
   ```
3. Buka Admin → Bot WA, pilih **QR Code** atau **Kode Pairing**, lalu tautkan di WhatsApp
   (Pengaturan → Perangkat tertaut).

Sesi tersimpan di `bot/auth/` (rahasia, jangan di-commit/dibagikan). Bot menyambung ulang sendiri
setelah restart; website dan bot saling sinkron lewat tabel `wa_bot` dan `wa_bot_commands`.

## Antrean pesan & cadangan OTP

Antrean `wa_outbox` berjalan terus selama proses hidup (`outbox-core.mjs`, dites di `outbox.test.mjs`):

- **Baileys tersambung** → semua pesan dikirim lewat Baileys. OTP didahulukan, dan teks kodenya dihapus dari tabel setelah terkirim/gagal.
- **Baileys mati** → pesan biasa menunggu (tetap `pending`). OTP yang lebih tua dari 10 menit ditandai gagal **dan kodenya dihapus**
  walau bot sedang mati (sebelumnya kode menumpuk di tabel sampai bot hidup lagi).
- **Cadangan Cloud API (opsional)** → bila `WA_CLOUD_*` di `.env` terisi, OTP dikirim lewat WhatsApp Cloud API saat Baileys mati atau gagal kirim.
  Hanya OTP: pesan bisnis di luar jendela 24 jam wajib template yang disetujui Meta, jadi notifikasi lain tidak ikut.
  Siapkan template kategori **Authentication** (satu variabel kode di body; tombol salin-kode opsional → `WA_CLOUD_OTP_BUTTON=false` bila tidak ada).
  Log saat start menunjukkan status: `Cadangan OTP via WhatsApp Cloud API: AKTIF/nonaktif`.

> Modul Cloud API (`wa-cloud.mjs`) dites dengan fetch palsu, belum pernah dipanggil ke server Meta sungguhan.
> Uji sekali dengan nomor sendiri (matikan bot lalu minta OTP dari halaman Profil) sebelum mengandalkannya.

Catatan upgrade: `startOutbox` kini dipanggil sekali dengan `startOutbox({ getSock })`, bukan per soket (`startOutbox(sock)`).
