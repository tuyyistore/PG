# Supabase

## Urutan menjalankan (proyek baru)

1. `schema.sql` — bootstrap awal (v1). **Bukan** skema terkini, lihat banner di file itu.
2. `migration_v2.sql` … `migration_v19.sql` — **berurutan, masing-masing sekali** di SQL Editor.
   Beberapa migrasi minta dijalankan bersamaan dengan deploy kode (lihat komentar di kepala file dan `PERUBAHAN.md`).
3. `seed.sql` — data awal opsional.

Butuh PostgreSQL 15+ (view `security_invoker`).

## Snapshot skema terkini

Skema yang berlaku = hasil semua migrasi, dan paling akurat diambil dari database langsung (butuh Supabase CLI + akses proyek):

```bash
supabase db dump --schema public -f supabase/snapshot.sql
```

Commit hasilnya setelah tiap migrasi besar supaya setup baru tidak perlu memutar ulang 19 file.

## Tes database (pgTAP)

`tests/*.test.sql` berisi tes untuk RPC top up gateway (idempotensi saldo, hak akses). Jalankan di Supabase lokal:

```bash
supabase start
supabase test db
```

> Tes ini ditulis tanpa bisa dijalankan di lingkungan penulisnya (butuh Postgres + skema Supabase). Jalankan sekali di staging dan perbaiki bila ada penyesuaian kecil.

## Pengaturan yang TIDAK bisa ditegakkan lewat SQL

- **Authentication → Policies → Minimum password length = 8.** Batas 8 karakter di frontend/`api/admin-reset-password.js` hanya
  lapisan UI/server kita; yang menegakkannya untuk pendaftaran adalah pengaturan Auth ini.
- **Authentication → Confirm email = nonaktif** (akun username memakai email internal palsu).
