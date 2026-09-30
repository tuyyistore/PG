-- ════════════════════════════════════════════════════════════════════════
-- Migration v11 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v10.sql
-- Menambahkan:
--   1. ID pengguna unik (mis. USR-K7M2QX9P) — dibuat otomatis, tidak bisa diubah dari client.
--   2. Notifikasi / pesan dari admin:
--        • kirim ke SATU pengguna (pakai email, ID pengguna USR-…, atau @username)
--        • kirim ke SEMUA pengguna
--      Setiap penerima punya salinan pesan sendiri, jadi pesan ke satu user
--      TIDAK terlihat oleh user lain, dan status "dibaca" dihitung per user.
--   3. Tipe notifikasi dirapikan: info · pesanan · saldo · promo · peringatan.
-- Tidak perlu env baru dan tidak ada yang berubah pada fungsi lama.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. ID pengguna ────────────────────────────────────────────────────────
alter table public.profiles add column if not exists user_code text;

-- Karakter tanpa yang mirip (0/O, 1/I/L), sama seperti kode order.
create or replace function public.gen_user_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'USR-';
    for i in 1..8 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where user_code = code);
  end loop;
  return code;
end $$;

-- Isi ID untuk pengguna yang sudah ada.
do $$
declare r record;
begin
  for r in select id from public.profiles where user_code is null loop
    update public.profiles set user_code = public.gen_user_code() where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column user_code set not null;
create unique index if not exists profiles_user_code_key on public.profiles (user_code);

-- Trigger: selalu buat ID baru saat INSERT, dan cegah perubahan ID saat UPDATE.
create or replace function public.profiles_set_user_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.user_code := public.gen_user_code();
  else
    new.user_code := old.user_code;
  end if;
  return new;
end $$;

drop trigger if exists profiles_set_user_code on public.profiles;
create trigger profiles_set_user_code before insert or update on public.profiles
  for each row execute function public.profiles_set_user_code();

-- Fungsi internal: tidak boleh dipanggil langsung dari client.
revoke all on function public.gen_user_code() from public, anon, authenticated;
revoke all on function public.profiles_set_user_code() from public, anon, authenticated;

-- ── 2. Tabel notifikasi ───────────────────────────────────────────────────
-- Satu "batch" = satu kali kirim dari admin (riwayat untuk admin).
create table if not exists public.notification_batches (
  id bigint generated always as identity primary key,
  audience text not null check (audience in ('user', 'all')),
  target_user_id uuid references auth.users on delete set null,
  target_label text,                                   -- untuk riwayat: email + ID user tujuan
  type text not null default 'info' check (type in ('info', 'pesanan', 'saldo', 'promo', 'peringatan')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 1000),
  recipient_count int not null default 0,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- Satu baris per penerima. Isi pesan disalin supaya user tidak perlu akses ke tabel batch.
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  batch_id bigint references public.notification_batches(id) on delete cascade,
  type text not null default 'info' check (type in ('info', 'pesanan', 'saldo', 'promo', 'peringatan')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx  on public.notifications (user_id, id desc);
create index if not exists notifications_batch_idx on public.notifications (batch_id);

alter table public.notifications        enable row level security;
alter table public.notification_batches enable row level security;

-- User hanya bisa melihat & menghapus notifikasinya sendiri.
drop policy if exists "notif: lihat sendiri" on public.notifications;
create policy "notif: lihat sendiri" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "notif: hapus sendiri" on public.notifications;
create policy "notif: hapus sendiri" on public.notifications for delete using (user_id = auth.uid());

-- Riwayat kirim hanya untuk admin.
drop policy if exists "batch: admin lihat" on public.notification_batches;
create policy "batch: admin lihat" on public.notification_batches for select using (public.is_admin());
drop policy if exists "batch: admin hapus" on public.notification_batches;
create policy "batch: admin hapus" on public.notification_batches for delete using (public.is_admin());

-- Tidak ada INSERT/UPDATE langsung dari client: pesan hanya dibuat lewat admin_send_notification(),
-- status "dibaca" hanya lewat notifications_mark_read().
revoke all on public.notifications        from anon, authenticated;
revoke all on public.notification_batches from anon, authenticated;
grant select, delete on public.notifications        to authenticated;
grant select, delete on public.notification_batches to authenticated;

-- ── 3. Cari pengguna dari email / ID / username (internal) ────────────────
-- Format yang dikenali:
--   USR-K7M2QX9P                              → ID pengguna
--   a1b2c3d4-…  (UUID)                        → id akun
--   nama@gmail.com                            → email
--   @budi  atau  budi                         → username
create or replace function public.resolve_user_target(p_target text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  t text := btrim(coalesce(p_target, ''));
  ids uuid[];
begin
  if t = '' then raise exception 'Isi email atau ID pengguna tujuan'; end if;

  if upper(t) like 'USR-%' then
    select array_agg(id) into ids from public.profiles where user_code = upper(t);
  elsif t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select array_agg(id) into ids from public.profiles where id = t::uuid;
  elsif left(t, 1) = '@' then
    select array_agg(id) into ids from public.profiles where lower(username) = lower(substr(t, 2));
  elsif position('@' in t) > 0 then
    select array_agg(id) into ids from public.profiles where lower(email) = lower(t);
  else
    select array_agg(id) into ids from public.profiles where lower(username) = lower(t);
  end if;

  if ids is null or array_length(ids, 1) = 0 then
    raise exception 'Pengguna tidak ditemukan. Cek email / ID pengguna (USR-…) / username.';
  end if;
  if array_length(ids, 1) > 1 then
    raise exception 'Lebih dari satu pengguna cocok. Gunakan ID pengguna (USR-…).';
  end if;
  return ids[1];
end $$;
revoke all on function public.resolve_user_target(text) from public, anon, authenticated;

-- ── 4. Admin kirim pesan ──────────────────────────────────────────────────
--   p_audience = 'user' → hanya ke p_target (email / USR-… / UUID / @username)
--   p_audience = 'all'  → ke semua pengguna (kecuali akun admin pengirim)
create or replace function public.admin_send_notification(
  p_audience text, p_target text, p_type text, p_title text, p_body text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_type  text := coalesce(nullif(btrim(p_type), ''), 'info');
  v_title text := btrim(coalesce(p_title, ''));
  v_body  text := btrim(coalesce(p_body, ''));
  target uuid;
  tp public.profiles;
  bid bigint;
  n int;
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh mengirim pesan'; end if;
  if v_type not in ('info', 'pesanan', 'saldo', 'promo', 'peringatan') then raise exception 'Tipe notifikasi tidak valid'; end if;
  if char_length(v_title) not between 1 and 100 then raise exception 'Judul wajib diisi (maksimal 100 karakter)'; end if;
  if char_length(v_body) not between 1 and 1000 then raise exception 'Isi pesan wajib diisi (maksimal 1000 karakter)'; end if;

  if p_audience = 'user' then
    target := public.resolve_user_target(p_target);
    select * into tp from public.profiles where id = target;
    insert into public.notification_batches (audience, target_user_id, target_label, type, title, body, recipient_count)
      values ('user', target, coalesce(tp.email, '-') || ' (' || tp.user_code || ')', v_type, v_title, v_body, 1)
      returning id into bid;
    insert into public.notifications (user_id, batch_id, type, title, body)
      values (target, bid, v_type, v_title, v_body);
    n := 1;

  elsif p_audience = 'all' then
    insert into public.notification_batches (audience, target_label, type, title, body)
      values ('all', 'Semua pengguna', v_type, v_title, v_body)
      returning id into bid;
    insert into public.notifications (user_id, batch_id, type, title, body)
      select id, bid, v_type, v_title, v_body from public.profiles where id <> me;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Belum ada pengguna lain untuk dikirimi pesan'; end if;
    update public.notification_batches set recipient_count = n where id = bid;

  else
    raise exception 'Audiens tidak valid (pilih user atau all)';
  end if;

  return jsonb_build_object('batch_id', bid, 'recipients', n);
end $$;
revoke all on function public.admin_send_notification(text, text, text, text, text) from public, anon;
grant execute on function public.admin_send_notification(text, text, text, text, text) to authenticated;

-- ── 5. User menandai notifikasinya sendiri sebagai dibaca ─────────────────
--   p_ids null → tandai semua yang belum dibaca.
create or replace function public.notifications_mark_read(p_ids bigint[] default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
end $$;
revoke all on function public.notifications_mark_read(bigint[]) from public, anon;
grant execute on function public.notifications_mark_read(bigint[]) to authenticated;

notify pgrst, 'reload schema';
