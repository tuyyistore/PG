-- ════════════════════════════════════════════════════════════════════════
-- Migration v6 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v5.sql
-- Menambahkan login GitHub (tidak perlu SQL, cukup aktifkan providernya di
-- Dashboard → Authentication → Providers) dan login Username + Password.
--
-- PENTING sebelum pakai login username:
-- 1. Buka Dashboard → Authentication → Providers → Email, matikan "Confirm email".
--    Akun username memakai alamat email palsu (tidak bisa menerima surel
--    konfirmasi), jadi konfirmasi wajib dimatikan supaya akun langsung aktif.
-- 2. Buka Dashboard → Authentication → Providers → GitHub, aktifkan lalu isi
--    Client ID & Client Secret dari GitHub OAuth App (Authorization callback
--    URL: isi dengan Callback URL yang ditampilkan Supabase di halaman itu).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Kolom username di profil (opsional untuk akun Google/GitHub, wajib untuk akun username) ──
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_key on public.profiles (lower(username)) where username is not null;

-- ── 2. Profil otomatis dibuat saat user baru dibuat, sekarang ikut menyalin username & whatsapp ──
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, username, whatsapp)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'username',
          new.raw_user_meta_data ->> 'whatsapp')
  on conflict (id) do nothing;
  return new;
end $$;
-- Trigger "on_auth_user_created" dari schema.sql tetap dipakai, cuma fungsinya diganti di atas.

notify pgrst, 'reload schema';
