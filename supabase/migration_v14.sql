-- ════════════════════════════════════════════════════════════════════════
-- Migration v14 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v13.sql
-- JALANKAN BERSAMAAN dengan deploy kode terbaru. Butuh PostgreSQL 15+ (default Supabase).
--
--  5. Top up: permintaan pending kedaluwarsa otomatis, user bisa membatalkan sendiri,
--     nomor WA admin diambil dari Pengaturan.
--  6. Verifikasi nomor WhatsApp lewat OTP (dikirim bot). Notifikasi WA & bonus referral
--     hanya untuk nomor yang sudah terverifikasi.
--  7. Admin: view + statistik di server (tanpa batas 1000/500 baris di browser).
-- ════════════════════════════════════════════════════════════════════════

-- ── 5. Top up ───────────────────────────────────────────────────────────
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.topups'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.topups drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.topups add constraint topups_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled'));

insert into public.app_settings (key, value) values ('topup_expire_hours', '24') on conflict do nothing;

create or replace function public.get_public_settings() returns table (key text, value text)
language sql stable security definer set search_path = public as $$
  select s.key, s.value from public.app_settings s where s.key in ('pay_info', 'admin_wa', 'topup_expire_hours')
$$;
grant execute on function public.get_public_settings() to anon, authenticated;

-- Permintaan pending yang lewat batas jam ditandai 'expired' (kode uniknya bebas lagi).
create or replace function public.expire_stale_topups() returns int
language plpgsql security definer set search_path = public as $$
declare hrs int := public.setting_int('topup_expire_hours', 24); n int := 0;
begin
  if hrs <= 0 then return 0; end if;
  update public.topups set status = 'expired'
   where status = 'pending' and created_at < now() - make_interval(hours => hrs);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_stale_topups() from public, anon, authenticated;

create or replace function public.request_topup(p_amount bigint) returns table (id bigint, amount bigint, unique_code int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code int; tries int := 0; new_id bigint;
begin
  if uid is null then raise exception 'Harus login'; end if;
  if p_amount < 1000 or p_amount > 10000000 then raise exception 'Nominal top up Rp 1.000 - Rp 10.000.000'; end if;
  perform public.expire_stale_topups();
  if (select count(*) from public.topups t where t.user_id = uid and t.status = 'pending') >= 3 then
    raise exception 'Masih ada 3 permintaan top up yang belum diproses. Batalkan yang tidak dipakai.';
  end if;
  loop
    code := 1 + floor(random() * 99)::int;
    exit when not exists (select 1 from public.topups t where t.status = 'pending' and t.amount + t.unique_code = p_amount + code);
    tries := tries + 1;
    if tries > 30 then raise exception 'Coba lagi sebentar'; end if;
  end loop;
  insert into public.topups (user_id, amount, status, unique_code) values (uid, p_amount, 'pending', code) returning topups.id into new_id;
  return query select new_id, p_amount, code;
end $$;
grant execute on function public.request_topup(bigint) to authenticated;

-- User membatalkan permintaan miliknya sendiri yang masih pending.
create or replace function public.cancel_topup(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  update public.topups set status = 'cancelled' where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
end $$;
revoke all on function public.cancel_topup(bigint) from public, anon;
grant execute on function public.cancel_topup(bigint) to authenticated;

-- Admin masih boleh menyetujui permintaan yang sudah kedaluwarsa (transfer bisa telat masuk).
create or replace function public.approve_topup(tid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.topups;
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh menyetujui'; end if;
  update public.topups set status = 'approved' where id = tid and status in ('pending', 'expired') returning * into t;
  if t.id is null then raise exception 'Top up tidak ditemukan atau sudah diproses'; end if;
  update public.profiles set saldo = saldo + t.amount where id = t.user_id;
end $$;
grant execute on function public.approve_topup(bigint) to authenticated;

-- ── 6. Verifikasi WhatsApp (OTP) ────────────────────────────────────────
alter table public.profiles add column if not exists whatsapp_verified boolean not null default false;
-- Satu nomor terverifikasi hanya untuk satu akun (menutup farming referral multi-akun).
-- Akun lama sengaja TIDAK otomatis terverifikasi; mereka diminta verifikasi di Pengaturan.
-- (Mau mempertahankan notifikasi WA akun lama? jalankan manual:
--    update public.profiles set whatsapp_verified = true where whatsapp is not null; — tidak disarankan.)
create unique index if not exists profiles_wa_verified_uniq on public.profiles (whatsapp) where whatsapp_verified;

-- Nomor tidak lagi bisa diubah langsung dari klien; hanya lewat verify_wa_otp.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, contact_email) on public.profiles to authenticated;

create table if not exists public.wa_otps (
  user_id uuid primary key references auth.users on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0
);
create table if not exists public.wa_otp_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  phone text not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_otp_log_user_idx on public.wa_otp_log (user_id, created_at desc);
create index if not exists wa_otp_log_phone_idx on public.wa_otp_log (phone, created_at desc);
alter table public.wa_otps enable row level security;
alter table public.wa_otp_log enable row level security;
revoke all on public.wa_otps, public.wa_otp_log from anon, authenticated;

create or replace function public._otp_hash(p_uid uuid, p_phone text, p_code text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(p_uid::text || ':' || p_phone || ':' || p_code, 'UTF8')), 'hex')
$$;
revoke all on function public._otp_hash(uuid, text, text) from public, anon, authenticated;

create or replace function public.request_wa_otp(p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ph text := public.norm_phone(p_phone);
  code text;
  last_sent timestamptz;
begin
  if uid is null then raise exception 'Harus login'; end if;
  if ph is null or ph !~ '^[1-9][0-9]{9,14}$' then
    raise exception 'Nomor WhatsApp tidak valid (contoh: 081234567890)';
  end if;
  if exists (select 1 from public.profiles where id = uid and whatsapp_verified and whatsapp = ph) then
    raise exception 'Nomor ini sudah terverifikasi di akunmu';
  end if;
  if exists (select 1 from public.profiles where id <> uid and whatsapp_verified and whatsapp = ph) then
    raise exception 'Nomor ini sudah terverifikasi di akun lain';
  end if;

  select max(created_at) into last_sent from public.wa_otp_log where user_id = uid;
  if last_sent is not null and last_sent > now() - interval '60 seconds' then
    raise exception 'Tunggu 1 menit sebelum meminta kode lagi';
  end if;
  if (select count(*) from public.wa_otp_log where user_id = uid and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Terlalu banyak permintaan kode, coba lagi nanti';
  end if;
  -- Batas per nomor supaya satu nomor tidak bisa dibombardir dari banyak akun.
  if (select count(*) from public.wa_otp_log where phone = ph and created_at > now() - interval '1 hour') >= 3 then
    raise exception 'Terlalu banyak permintaan untuk nomor ini, coba lagi nanti';
  end if;

  code := lpad(floor(random() * 1000000)::int::text, 6, '0');
  insert into public.wa_otps (user_id, phone, code_hash, expires_at, attempts)
  values (uid, ph, public._otp_hash(uid, ph, code), now() + interval '5 minutes', 0)
  on conflict (user_id) do update
    set phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0;
  insert into public.wa_otp_log (user_id, phone) values (uid, ph);
  delete from public.wa_otp_log where created_at < now() - interval '1 day';

  perform public.enqueue_wa(ph, 'Kode verifikasi Tuyyi Store: ' || code || '. Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.', 'otp');
  return jsonb_build_object('phone', ph, 'expires_in', 300);
end $$;
revoke all on function public.request_wa_otp(text) from public, anon;
grant execute on function public.request_wa_otp(text) to authenticated;

-- Selalu mengembalikan jsonb {ok, message} (tidak raise) supaya hitungan percobaan salah tidak ikut di-rollback.
create or replace function public.verify_wa_otp(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wa_otps;
begin
  if uid is null then raise exception 'Harus login'; end if;
  select * into r from public.wa_otps where user_id = uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Minta kode verifikasi dulu');
  end if;
  if r.expires_at < now() then
    delete from public.wa_otps where user_id = uid;
    return jsonb_build_object('ok', false, 'message', 'Kode sudah kedaluwarsa, minta kode baru');
  end if;
  if r.attempts >= 5 then
    delete from public.wa_otps where user_id = uid;
    return jsonb_build_object('ok', false, 'message', 'Terlalu banyak salah, minta kode baru');
  end if;
  if r.code_hash <> public._otp_hash(uid, r.phone, btrim(coalesce(p_code, ''))) then
    update public.wa_otps set attempts = attempts + 1 where user_id = uid;
    return jsonb_build_object('ok', false, 'message', 'Kode salah. Sisa percobaan: ' || (4 - r.attempts));
  end if;

  begin
    update public.profiles set whatsapp = r.phone, whatsapp_verified = true where id = uid;
  exception when unique_violation then
    delete from public.wa_otps where user_id = uid;
    return jsonb_build_object('ok', false, 'message', 'Nomor ini sudah terverifikasi di akun lain');
  end;
  delete from public.wa_otps where user_id = uid;
  return jsonb_build_object('ok', true, 'whatsapp', r.phone);
end $$;
revoke all on function public.verify_wa_otp(text) from public, anon;
grant execute on function public.verify_wa_otp(text) to authenticated;

-- Kirim WA ke user hanya bila nomornya terverifikasi.
create or replace function public.enqueue_wa_user(p_uid uuid, p_message text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text;
begin
  select whatsapp into ph from public.profiles where id = p_uid and whatsapp_verified;
  if ph is not null then perform public.enqueue_wa(ph, p_message, p_kind); end if;
end $$;
revoke all on function public.enqueue_wa_user(uuid, text, text) from public, anon, authenticated;

create or replace function public.trg_wa_order_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare adm text;
begin
  perform public.enqueue_wa_user(new.user_id,
    'Pesanan ' || new.order_code || ' (' || new.product_name || ') diterima. Status: ' || new.status ||
    case when new.status = 'aktif' then '. Data akun sudah bisa dilihat di dashboard.' else '. Admin akan segera memproses.' end, 'pesanan');
  select value into adm from public.app_settings where key = 'admin_wa';
  if adm is not null and adm <> '' then
    perform public.enqueue_wa(adm, 'Pesanan baru ' || new.order_code || ': ' || new.product_name || ' Rp ' || new.price || ' (' || new.status || ')', 'admin');
  end if;
  return new;
end $$;

create or replace function public.trg_wa_order_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'aktif' then
    perform public.enqueue_wa_user(new.user_id, 'Pesanan ' || new.order_code || ' (' || new.product_name || ') sudah diproses. Buka dashboard untuk melihat data akun.', 'pesanan');
  end if;
  return new;
end $$;

create or replace function public.trg_wa_saldo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.saldo > old.saldo and new.whatsapp_verified then
    perform public.enqueue_wa(new.whatsapp, 'Saldo masuk Rp ' || (new.saldo - old.saldo) || '. Saldo kamu sekarang Rp ' || new.saldo || '.', 'saldo');
  end if;
  return new;
end $$;

-- _cancel_order_core (dari v13) — satu-satunya perubahan: WA ke pembeli lewat enqueue_wa_user.
create or replace function public._cancel_order_core(p_order_id bigint, p_reason text, p_refund boolean, p_restock boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  refund bigint := 0;
  restocked boolean := false;
  n_open int;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if o.status = 'dibatalkan' then raise exception 'Pesanan sudah dibatalkan'; end if;

  perform set_config('app.cancelling', '1', true);

  if p_refund and o.price > 0 then
    update public.profiles set saldo = saldo + o.price where id = o.user_id;
    refund := o.price;
  end if;

  if p_restock and o.product_id is not null then
    update public.product_stock set sold_order_id = null where sold_order_id = o.id;
    if found then
      restocked := true;
    else
      update public.products set stock = stock + 1
       where id = o.product_id and stock is not null and not auto_delivery;
    end if;
  end if;

  if o.voucher_id is not null then
    select count(*) into n_open from public.orders
     where user_id = o.user_id and voucher_id = o.voucher_id and id <> o.id and status <> 'dibatalkan';
    if n_open = 0 then
      delete from public.voucher_redemptions where voucher_id = o.voucher_id and user_id = o.user_id;
      if found then
        update public.vouchers set used_count = greatest(used_count - 1, 0) where id = o.voucher_id;
      end if;
    end if;
  end if;

  update public.orders
     set status = 'dibatalkan',
         cancelled_at = now(),
         cancel_reason = v_reason,
         refunded_amount = refund,
         account_data = case when restocked then null else account_data end
   where id = o.id;

  insert into public.notifications (user_id, type, title, body)
  values (o.user_id, 'pesanan', 'Pesanan dibatalkan',
          'Pesanan ' || o.order_code || ' (' || o.product_name || ') dibatalkan.'
          || case when refund > 0 then ' Saldo Rp ' || refund || ' sudah dikembalikan.' else '' end
          || case when v_reason is not null then ' Alasan: ' || v_reason else '' end);

  perform public.enqueue_wa_user(o.user_id,
    'Pesanan ' || o.order_code || ' (' || o.product_name || ') dibatalkan.'
    || case when v_reason is not null then ' Alasan: ' || v_reason || '.' else '' end, 'pesanan');

  return jsonb_build_object('order_code', o.order_code, 'refunded', refund, 'restocked', p_restock);
end $$;
revoke all on function public._cancel_order_core(bigint, text, boolean, boolean) from public, anon, authenticated;

-- buy_with_saldo (dari v13) — satu-satunya perubahan: bonus referral juga butuh WhatsApp pembeli terverifikasi.
create or replace function public.buy_with_saldo(item_ids bigint[], voucher_code text default null) returns bigint[]
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  total bigint;
  net bigint;
  disc bigint := 0;
  vid bigint;
  vmsg text;
  buyer record;
  p record;
  stock_row record;
  new_ids bigint[] := '{}';
  oid bigint;
  share bigint;
  allocated bigint := 0;
  idx int := 0;
  cnt int;
  paid bigint;
  delivered text;
  ref_bonus constant bigint := 2000;
  ref_min constant bigint := 10000;
begin
  if uid is null then raise exception 'Harus login'; end if;
  select count(*), coalesce(sum(price), 0) into cnt, total from public.products where id = any(item_ids) and active;
  if cnt = 0 or total <= 0 then raise exception 'Produk tidak valid'; end if;
  if cnt <> (select count(distinct x) from unnest(item_ids) x) then raise exception 'Ada produk yang sudah tidak tersedia'; end if;

  if voucher_code is not null and btrim(voucher_code) <> '' then
    perform public.voucher_guard(uid);
    select v_id, v_discount, v_msg into vid, disc, vmsg from public.calc_voucher(voucher_code, total, uid);
    if vid is null then
      perform public.voucher_fail(uid);
      return '{}'::bigint[];
    end if;
    update public.vouchers set used_count = used_count + 1 where id = vid and (max_uses is null or used_count < max_uses);
    if not found then raise exception 'Kuota voucher sudah habis'; end if;
    insert into public.voucher_redemptions (voucher_id, user_id) values (vid, uid);
  end if;

  net := total - disc;
  update public.profiles set saldo = saldo - net where id = uid and saldo >= net returning * into buyer;
  if not found then raise exception 'Saldo tidak cukup'; end if;

  for p in select * from public.products where id = any(item_ids) and active order by id loop
    idx := idx + 1;
    delivered := null;
    if p.auto_delivery then
      select s.id, s.data into stock_row from public.product_stock s
       where s.product_id = p.id and s.sold_order_id is null order by s.id limit 1 for update skip locked;
      if stock_row.id is null then raise exception 'Stok % habis', p.name; end if;
      delivered := stock_row.data;
    elsif p.stock is not null then
      update public.products set stock = stock - 1 where id = p.id and stock > 0;
      if not found then raise exception 'Stok % habis', p.name; end if;
    end if;

    if idx = cnt then share := disc - allocated; else share := floor(disc * p.price / total::numeric)::bigint; end if;
    allocated := allocated + share;
    paid := p.price - share;

    insert into public.orders (user_id, product_id, product_name, category, price, period, icon, tone, logo_url, status,
                               buyer_whatsapp, buyer_contact_email, account_data, voucher_id)
    values (uid, p.id, p.name, p.category, paid, p.period, p.icon, p.tone, p.logo_url,
            case when delivered is not null then 'aktif' else 'pending' end,
            buyer.whatsapp, coalesce(buyer.contact_email, buyer.email), delivered, vid)
    returning id into oid;

    if delivered is not null then update public.product_stock set sold_order_id = oid where id = stock_row.id; end if;
    new_ids := new_ids || oid;
  end loop;

  if buyer.referred_by is not null and not buyer.referral_paid and net >= ref_min and buyer.whatsapp_verified then
    update public.profiles set referral_paid = true where id = uid;
    update public.profiles set saldo = saldo + ref_bonus where id = buyer.referred_by;
  end if;

  return new_ids;
end $$;
grant execute on function public.buy_with_saldo(bigint[], text) to authenticated;

-- process_stale_pending_orders (dari v13) + sekalian menandai top up kedaluwarsa.
create or replace function public.process_stale_pending_orders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sla int := public.setting_int('pending_sla_hours', 24);
  auto int := public.setting_int('pending_autorefund_hours', 0);
  o record;
  n_refunded int := 0;
  n_late int := 0;
  n_topups int := public.expire_stale_topups();
  adm text;
begin
  if auto > 0 then
    for o in select id from public.orders
              where status = 'pending' and created_at < now() - make_interval(hours => auto)
              order by id limit 100
    loop
      begin
        perform public._cancel_order_core(o.id, 'Tidak diproses dalam ' || auto || ' jam (otomatis)', true, true);
        n_refunded := n_refunded + 1;
      exception when others then
        raise warning 'auto-refund pesanan % gagal: %', o.id, sqlerrm;
      end;
    end loop;
  end if;

  if sla > 0 then
    select count(*) into n_late from public.orders
     where status = 'pending' and created_at < now() - make_interval(hours => sla);
    select value into adm from public.app_settings where key = 'admin_wa';
    if n_late > 0 and adm is not null and adm <> '' then
      perform public.enqueue_wa(adm, 'Pengingat: ' || n_late || ' pesanan pending lebih dari ' || sla || ' jam. Buka Admin → Pesanan untuk memprosesnya.', 'admin');
    end if;
  end if;

  return jsonb_build_object('late', n_late, 'auto_refunded', n_refunded, 'topups_expired', n_topups);
end $$;
revoke all on function public.process_stale_pending_orders() from public, anon, authenticated;

-- ── 7. Admin: view + statistik di server ────────────────────────────────
-- Dipakai halaman Admin dengan paginasi, pencarian, dan filter di server (PostgREST).
-- security_invoker = RLS tabel asli tetap berlaku; `where is_admin()` sebagai lapis kedua.
-- Catatan: kolom view dibekukan saat dibuat. Kalau kelak menambah kolom di orders/topups,
-- jalankan ulang blok ini (drop + create).
drop view if exists public.admin_orders;
create view public.admin_orders with (security_invoker = true) as
  select o.*, p.email as buyer_email, p.user_code as buyer_code, p.full_name as buyer_name
    from public.orders o
    left join public.profiles p on p.id = o.user_id
   where public.is_admin();
revoke all on public.admin_orders from anon, authenticated;
grant select on public.admin_orders to authenticated;

drop view if exists public.admin_topups;
create view public.admin_topups with (security_invoker = true) as
  select t.*, p.email as user_email, p.user_code as user_code
    from public.topups t
    left join public.profiles p on p.id = t.user_id
   where public.is_admin();
revoke all on public.admin_topups from anon, authenticated;
grant select on public.admin_topups to authenticated;

-- Omzet = semua pesanan yang tidak dibatalkan (saldo sudah terpotong saat membeli),
-- bukan hanya yang berstatus 'aktif'. Bulan dihitung dalam WIB.
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  sla int := public.setting_int('pending_sla_hours', 24);
  first_month timestamp := date_trunc('month', now() at time zone 'Asia/Jakarta') - interval '5 months';
  r jsonb;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  select jsonb_build_object(
    'users',             (select count(*) from public.profiles),
    'orders',            (select count(*) from public.orders),
    'orders_pending',    (select count(*) from public.orders where status = 'pending'),
    'topups_pending',    (select count(*) from public.topups where status = 'pending'),
    'revenue',           (select coalesce(sum(price), 0) from public.orders where status <> 'dibatalkan'),
    'revenue_delivered', (select coalesce(sum(price), 0) from public.orders where status = 'aktif'),
    'pending_value',     (select coalesce(sum(price), 0) from public.orders where status = 'pending'),
    'refunded',          (select coalesce(sum(refunded_amount), 0) from public.orders where status = 'dibatalkan'),
    'late',              (select count(*) from public.orders
                           where sla > 0 and status = 'pending' and created_at < now() - make_interval(hours => sla)),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.d, 'YYYY-MM'), 'total', coalesce(t.total, 0)) order by m.d), '[]'::jsonb)
        from generate_series(first_month, first_month + interval '5 months', interval '1 month') as m(d)
        left join (
          select date_trunc('month', created_at at time zone 'Asia/Jakarta') as mm, sum(price) as total
            from public.orders
           where status <> 'dibatalkan' and created_at >= first_month at time zone 'Asia/Jakarta'
           group by 1
        ) t on t.mm = m.d
    )
  ) into r;
  return r;
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

notify pgrst, 'reload schema';
