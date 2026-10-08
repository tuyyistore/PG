-- ════════════════════════════════════════════════════════════════════════
-- Migration v19 — pembersihan sisa integrasi lama (GoBiz / DOKU)
-- Jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v18.sql. Aman diulang (idempoten).
--
-- Konteks: v8 membuang GoBiz, v9 membuang DOKU, v16 memasang Betabotz. Yang masih tertinggal:
--   • tabel `payments` — tidak dirujuk kode/fungsi mana pun lagi (fungsi create_topup_payment & settle_payment sudah di-drop);
--   • instalasi baru yang menjalankan schema.sql lalu migrasi parsial bisa masih punya gobiz_session / *_claimed_tx
--     (gobiz_session menyimpan TOKEN sesi GoBiz → tidak boleh dibiarkan).
-- `payments` TIDAK langsung di-drop: diganti nama jadi `payments_legacy` dan dikunci (tak ada akses dari klien),
-- supaya arsip lama tidak hilang bila ternyata masih dibutuhkan. Hapus manual setelah yakin (perintah di bawah).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Tabel/fungsi sisa yang tidak punya nilai arsip (token & klaim transaksi) — buang.
drop table if exists public.gobiz_session;
drop table if exists public.gobiz_claimed_tx;
drop table if exists public.doku_claimed_tx;
drop function if exists public.create_topup_payment(bigint);
drop function if exists public.settle_payment(bigint, text);

-- 2. Arsipkan & kunci tabel payments.
do $$
begin
  if to_regclass('public.payments') is not null and to_regclass('public.payments_legacy') is null then
    alter table public.payments rename to payments_legacy;
  end if;
  if to_regclass('public.payments_legacy') is not null then
    alter table public.payments_legacy enable row level security;
    revoke all on public.payments_legacy from anon, authenticated;
    drop policy if exists "payment: lihat sendiri" on public.payments_legacy;
    drop policy if exists "payment: buat sendiri" on public.payments_legacy;
    comment on table public.payments_legacy is 'Arsip integrasi GoBiz/DOKU (tidak dipakai). Aman di-drop setelah diverifikasi: drop table public.payments_legacy;';
  end if;
end $$;

-- Setelah yakin arsip tidak dibutuhkan (opsional, tidak bisa dibatalkan):
--   drop table public.payments_legacy;

notify pgrst, 'reload schema';
