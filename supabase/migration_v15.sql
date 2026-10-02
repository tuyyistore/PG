-- v15: Pengaturan Bot WhatsApp di Admin (sambung via QR / kode pairing, status sinkron dengan bot).
-- Jalankan setelah v14. Aman dijalankan ulang.

-- Status bot (satu baris, id = 1). Ditulis HANYA oleh bot (service_role); admin hanya membaca.
create table if not exists public.wa_bot (
  id int primary key default 1 check (id = 1),
  status text not null default 'offline'
    check (status in ('offline', 'connecting', 'qr', 'pairing', 'connected', 'logged_out')),
  phone text,                 -- nomor yang sedang tertaut
  pair_phone text,            -- nomor yang diminta untuk kode pairing
  qr text,                    -- gambar QR (data URL) selama status 'qr'
  pairing_code text,          -- kode 8 karakter selama status 'pairing'
  last_error text,
  heartbeat_at timestamptz,   -- diperbarui bot tiap ±15 detik; basi = bot tidak berjalan
  updated_at timestamptz not null default now()
);
insert into public.wa_bot (id) values (1) on conflict do nothing;

-- Antrean perintah dari website ke bot. Hanya lewat RPC admin_wa_bot_command.
create table if not exists public.wa_bot_commands (
  id bigint generated always as identity primary key,
  action text not null check (action in ('connect_qr', 'connect_pair', 'logout', 'restart')),
  phone text,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists wa_bot_commands_pending_idx on public.wa_bot_commands (id) where status = 'pending';

alter table public.wa_bot enable row level security;
alter table public.wa_bot_commands enable row level security;
drop policy if exists "wa_bot: admin lihat" on public.wa_bot;
create policy "wa_bot: admin lihat" on public.wa_bot for select using (public.is_admin());

-- QR / kode pairing sensitif: tidak ada akses tulis untuk anon/authenticated, hanya baca (dijaga RLS) untuk admin.
revoke all on public.wa_bot from anon, authenticated;
revoke all on public.wa_bot_commands from anon, authenticated;
grant select on public.wa_bot to authenticated;

-- Admin → bot: sambungkan (QR / pairing), putuskan, mulai ulang.
create or replace function public.admin_wa_bot_command(p_action text, p_phone text default null) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone);
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if p_action not in ('connect_qr', 'connect_pair', 'logout', 'restart') then raise exception 'Perintah tidak dikenal'; end if;
  if p_action = 'connect_pair' and (ph is null or length(ph) < 9 or length(ph) > 15) then
    raise exception 'Nomor WhatsApp tidak valid (contoh: 6281234567890)';
  end if;

  -- Perintah lama yang belum diambil bot digantikan oleh yang terbaru.
  update public.wa_bot_commands set status = 'failed', error = 'digantikan', done_at = now() where status = 'pending';
  insert into public.wa_bot_commands (action, phone) values (p_action, case when p_action = 'connect_pair' then ph end);

  if p_action in ('connect_qr', 'connect_pair') then
    -- Umpan balik instan di UI; bot menimpa dengan status sebenarnya begitu mengambil perintah.
    update public.wa_bot
       set status = 'connecting', qr = null, pairing_code = null, last_error = null,
           pair_phone = case when p_action = 'connect_pair' then ph end, updated_at = now()
     where id = 1;
  end if;

  insert into public.audit_log (actor, action, target, detail)
  values (auth.uid(), 'wa_bot', p_action, '{}'::jsonb);
end $$;
revoke all on function public.admin_wa_bot_command(text, text) from public, anon;
grant execute on function public.admin_wa_bot_command(text, text) to authenticated;

-- Pesan uji dari dashboard (lewat antrean wa_outbox yang sama dengan notifikasi lain).
create or replace function public.admin_wa_test(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone);
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if ph is null or length(ph) < 9 or length(ph) > 15 then raise exception 'Nomor WhatsApp tidak valid (contoh: 6281234567890)'; end if;
  perform public.enqueue_wa(ph, 'Tes bot TUYYI STORE dari dashboard admin. Bot WhatsApp berfungsi ✅', 'admin');
end $$;
revoke all on function public.admin_wa_test(text) from public, anon;
grant execute on function public.admin_wa_test(text) to authenticated;

-- Ringkasan antrean WA (tanpa membuka isi pesan; wa_outbox bisa memuat OTP).
create or replace function public.admin_wa_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'pending', (select count(*) from public.wa_outbox where status = 'pending'),
    'sent_24h', (select count(*) from public.wa_outbox where status = 'sent' and sent_at > now() - interval '24 hours'),
    'failed_24h', (select count(*) from public.wa_outbox where status = 'failed' and created_at > now() - interval '24 hours')
  );
end $$;
revoke all on function public.admin_wa_stats() from public, anon;
grant execute on function public.admin_wa_stats() to authenticated;
