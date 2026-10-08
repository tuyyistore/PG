# Integrasi Betabotz Paygate (top up saldo otomatis)

Dokumentasi resmi: https://web.btzpay.my.id/documentation · Base URL: `https://web.btzpay.my.id`

## Cara kerja

Sistem TUYYI STORE berbasis **saldo**: customer top up → saldo bertambah → beli produk dengan saldo → pesanan `pending` → admin mengisi data akun. Betabotz dipasang di **top up**, sehingga checkout, voucher, dan alur pesanan tidak berubah.

1. Customer isi nominal di halaman **Saldo** → `POST /api/btz-create-topup`.
2. Server membuat baris `topups` (`gateway='betabotz'`) lalu memanggil `POST /api/qris/create` Betabotz (API key dari env). `transactionId`, `accessKey`, `paymentUrl`, `qrisString`, `totalAmount`, `expiredAt` disimpan.
3. Customer scan QR / buka `paymentUrl` dan membayar.
4. Betabotz memanggil `POST /api/btz-callback?token=…` (utama). Halaman Saldo juga polling `GET /api/btz-status` (fallback) dengan backoff 5 → 30 dtk; server menahan panggilan berulang ke gateway selama 3 dtk per top up.
5. Server **tidak mempercayai body callback**: ia hanya mengambil `transactionId`, lalu membaca ulang transaksi ke `GET /api/qris/transaction/:id?key=…` dan mencocokkan `transactionId`, `metadata.orderId` (`TOPUP-<id>`), dan `amount`.
6. Bila status Betabotz `sukses`, RPC `settle_gateway_topup` mengubah `pending/expired → approved` dan menambah saldo **dalam satu transaksi** (idempoten).

Pemetaan status: `pending→pending`, `sukses→approved` (PAID), `expired→expired`, `cancel→cancelled`, `gagal→rejected`. Hanya `sukses` yang menambah saldo.

> **Soal produk digital:** produk tetap diproses admin (pesanan `pending` → isi data akun), sesuai aturan toko saat ini. Integrasi ini hanya mengotomatiskan **masuknya saldo**.

## Pasang

1. Supabase → SQL Editor: jalankan `supabase/migration_v16.sql` (setelah v15), bersamaan dengan deploy.
2. Dashboard Betabotz: buat Payment Method, salin API key, pasang aplikasi listener di HP (lihat https://web.btzpay.my.id/tutorial). **Akun free punya limit Payment Method 0** — butuh role business/enterprise.
3. Vercel → Settings → Environment Variables (Production, tanpa prefix `VITE_`):
   - `BETABOTZ_API_KEY` — API key Payment Method
   - `BETABOTZ_WEBHOOK_SECRET` — string acak, mis. `openssl rand -hex 32`
   - `SITE_URL` — `https://pg-beta-nine.vercel.app` (atau domain kamu)
   - opsional: `BETABOTZ_PAYMENT_METHOD`, `BETABOTZ_TIMEOUT_MINUTES` (1–60, default 30), `BETABOTZ_BASE_URL`
4. Redeploy. Tidak ada dependency baru (memakai `fetch` bawaan Node 22).

## Tes

- Unit test: `pnpm test` (termasuk `api/btz.test.js`: pemetaan status, validasi nominal/id, idempotensi callback+polling bersamaan, expired/cancel/gagal tidak kredit; `api/btz-handlers.test.js`: perilaku HTTP callback/status/cancel dan throttle).
- Sandbox: dokumentasi menyebut "Coba di Sandbox" lewat login dashboard Betabotz. Untuk tes uji-coba manual:
  1. Deploy ke Vercel Production/Preview dengan env di atas (callback harus URL publik; preview dengan Deployment Protection akan memblokir callback).
  2. Top up Rp 1.000 dari halaman Saldo, bayar, lihat saldo naik otomatis.
  3. Kirim ulang callback yang sama (`curl -X POST "$SITE_URL/api/btz-callback?token=$SECRET" -H 'Content-Type: application/json' -d '{"pay_id":"TRX…"}'`) → saldo tidak bertambah lagi.
  4. Coba token salah → 401. Coba batalkan transaksi → status `cancelled`.
  5. Log Vercel: cari baris JSON `"scope":"btz"` (tanpa API key/body callback).
