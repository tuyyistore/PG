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
