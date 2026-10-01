create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values ('warungtuyyi@gmail.com') on conflict do nothing;
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
$$;

create policy "admins: admin lihat" on public.admins for select using (public.is_admin());

create table if not exists public.app_settings (
  key text primary key,
  value text not null default ''
);
alter table public.app_settings enable row level security;
drop policy if exists "settings: admin kelola" on public.app_settings;
create policy "settings: admin kelola" on public.app_settings for all using (public.is_admin()) with check (public.is_admin());
insert into public.app_settings (key, value) values ('pay_info', ''), ('admin_wa', '') on conflict do nothing;

create or replace function public.get_public_settings() returns table (key text, value text)
language sql stable security definer set search_path = public as $$
  select s.key, s.value from public.app_settings s where s.key in ('pay_info', 'admin_wa')
$$;
grant execute on function public.get_public_settings() to anon, authenticated;

alter table public.products add column if not exists auto_delivery boolean not null default false;
alter table public.products add column if not exists stock int check (stock is null or stock >= 0);

create table if not exists public.product_stock (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete cascade,
  data text not null,
  sold_order_id bigint references public.orders(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_stock_free_idx on public.product_stock (product_id) where sold_order_id is null;
alter table public.product_stock enable row level security;
drop policy if exists "stok: admin kelola" on public.product_stock;
create policy "stok: admin kelola" on public.product_stock for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.get_stock_counts() returns table (product_id bigint, available int)
language sql stable security definer set search_path = public as $$
  select p.id,
         case when p.auto_delivery then (select count(*)::int from public.product_stock s where s.product_id = p.id and s.sold_order_id is null)
              else p.stock end
    from public.products p
   where p.active
$$;
grant execute on function public.get_stock_counts() to anon, authenticated;

create table if not exists public.vouchers (
  id bigint generated always as identity primary key,
  code text not null unique,
  kind text not null check (kind in ('percent', 'fixed')),
  value bigint not null check (value > 0),
  max_discount bigint,
  min_total bigint not null default 0,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.vouchers enable row level security;
drop policy if exists "voucher: admin kelola" on public.vouchers;
create policy "voucher: admin kelola" on public.vouchers for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.voucher_redemptions (
  voucher_id bigint not null references public.vouchers(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (voucher_id, user_id)
);
alter table public.voucher_redemptions enable row level security;

create or replace function public.calc_voucher(p_code text, p_total bigint, p_uid uuid, out v_id bigint, out v_discount bigint, out v_msg text)
language plpgsql stable security definer set search_path = public as $$
declare v public.vouchers;
begin
  v_id := null; v_discount := 0; v_msg := null;
  if p_code is null or btrim(p_code) = '' then return; end if;
  select * into v from public.vouchers where upper(code) = upper(btrim(p_code));
  if v.id is null or not v.active then v_msg := 'Kode voucher tidak valid'; return; end if;
  if v.expires_at is not null and v.expires_at < now() then v_msg := 'Voucher sudah kedaluwarsa'; return; end if;
  if v.max_uses is not null and v.used_count >= v.max_uses then v_msg := 'Kuota voucher sudah habis'; return; end if;
  if p_total < v.min_total then v_msg := 'Minimal belanja Rp ' || v.min_total || ' untuk voucher ini'; return; end if;
  if exists (select 1 from public.voucher_redemptions r where r.voucher_id = v.id and r.user_id = p_uid) then
    v_msg := 'Voucher sudah pernah kamu pakai'; return;
  end if;
  if v.kind = 'percent' then
    v_discount := floor(p_total * least(v.value, 100) / 100.0)::bigint;
    if v.max_discount is not null then v_discount := least(v_discount, v.max_discount); end if;
  else
    v_discount := v.value;
  end if;
  v_discount := least(v_discount, p_total);
  v_id := v.id;
end $$;
revoke all on function public.calc_voucher(text, bigint, uuid) from public, anon, authenticated;

create or replace function public.check_voucher(p_code text, p_total bigint) returns table (valid boolean, discount bigint, message text)
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  select * into r from public.calc_voucher(p_code, p_total, auth.uid());
  return query select (r.v_id is not null), r.v_discount, r.v_msg;
end $$;
grant execute on function public.check_voucher(text, bigint) to authenticated;

alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists referral_paid boolean not null default false;

create or replace function public.apply_referral(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ref uuid;
begin
  if uid is null then raise exception 'Harus login'; end if;
  select id into ref from public.profiles where upper(user_code) = upper(btrim(p_code));
  if ref is null then raise exception 'Kode referral tidak ditemukan'; end if;
  if ref = uid then raise exception 'Tidak bisa memakai kode sendiri'; end if;
  if exists (select 1 from public.orders where user_id = uid) then raise exception 'Kode referral hanya bisa dipakai sebelum pembelian pertama'; end if;
  update public.profiles set referred_by = ref where id = uid and referred_by is null;
  if not found then raise exception 'Kamu sudah memakai kode referral'; end if;
end $$;
grant execute on function public.apply_referral(text) to authenticated;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
drop policy if exists "audit: admin lihat" on public.audit_log;
create policy "audit: admin lihat" on public.audit_log for select using (public.is_admin());

create or replace function public.trg_audit_saldo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.saldo is distinct from old.saldo then
    insert into public.audit_log (actor, action, target, detail)
    values (auth.uid(), 'saldo', new.id::text, jsonb_build_object('before', old.saldo, 'after', new.saldo, 'delta', new.saldo - old.saldo));
  end if;
  return new;
end $$;
drop trigger if exists audit_saldo on public.profiles;
create trigger audit_saldo after update of saldo on public.profiles for each row execute function public.trg_audit_saldo();

create or replace function public.trg_audit_order() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status or new.account_data is distinct from old.account_data then
    insert into public.audit_log (actor, action, target, detail)
    values (auth.uid(), 'order', new.order_code, jsonb_build_object('status_before', old.status, 'status_after', new.status, 'data_changed', new.account_data is distinct from old.account_data));
  end if;
  return new;
end $$;
drop trigger if exists audit_order on public.orders;
create trigger audit_order after update on public.orders for each row execute function public.trg_audit_order();

create or replace function public.trg_audit_topup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.audit_log (actor, action, target, detail)
    values (auth.uid(), 'topup', new.id::text, jsonb_build_object('amount', new.amount, 'status_before', old.status, 'status_after', new.status, 'user_id', new.user_id));
  end if;
  return new;
end $$;
drop trigger if exists audit_topup on public.topups;
create trigger audit_topup after update on public.topups for each row execute function public.trg_audit_topup();

create table if not exists public.wa_outbox (
  id bigint generated always as identity primary key,
  phone text not null,
  message text not null,
  kind text not null default 'info',
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamp with time zone
);
create index if not exists wa_outbox_pending_idx on public.wa_outbox (id) where status = 'pending';
alter table public.wa_outbox enable row level security;

create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case
    when p is null then null
    when regexp_replace(p, '\D', '', 'g') = '' then null
    when regexp_replace(p, '\D', '', 'g') like '0%' then '62' || substr(regexp_replace(p, '\D', '', 'g'), 2)
    else regexp_replace(p, '\D', '', 'g')
  end
$$;

create or replace function public.enqueue_wa(p_phone text, p_message text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := public.norm_phone(p_phone);
begin
  if ph is null then return; end if;
  insert into public.wa_outbox (phone, message, kind) values (ph, p_message, p_kind);
end $$;
revoke all on function public.enqueue_wa(text, text, text) from public, anon, authenticated;

create or replace function public.trg_wa_order_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare adm text;
begin
  perform public.enqueue_wa(new.buyer_whatsapp,
    'Pesanan ' || new.order_code || ' (' || new.product_name || ') diterima. Status: ' || new.status ||
    case when new.status = 'aktif' then '. Data akun sudah bisa dilihat di dashboard.' else '. Admin akan segera memproses.' end, 'pesanan');
  select value into adm from public.app_settings where key = 'admin_wa';
  if adm is not null and adm <> '' then
    perform public.enqueue_wa(adm, 'Pesanan baru ' || new.order_code || ': ' || new.product_name || ' Rp ' || new.price || ' (' || new.status || ')', 'admin');
  end if;
  return new;
end $$;
drop trigger if exists wa_order_new on public.orders;
create trigger wa_order_new after insert on public.orders for each row execute function public.trg_wa_order_new();

create or replace function public.trg_wa_order_upd() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'aktif' then
    perform public.enqueue_wa(new.buyer_whatsapp, 'Pesanan ' || new.order_code || ' (' || new.product_name || ') sudah diproses. Buka dashboard untuk melihat data akun.', 'pesanan');
  end if;
  return new;
end $$;
drop trigger if exists wa_order_upd on public.orders;
create trigger wa_order_upd after update on public.orders for each row execute function public.trg_wa_order_upd();

create or replace function public.trg_wa_saldo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.saldo > old.saldo then
    perform public.enqueue_wa(new.whatsapp, 'Saldo masuk Rp ' || (new.saldo - old.saldo) || '. Saldo kamu sekarang Rp ' || new.saldo || '.', 'saldo');
  end if;
  return new;
end $$;
drop trigger if exists wa_saldo on public.profiles;
create trigger wa_saldo after update of saldo on public.profiles for each row execute function public.trg_wa_saldo();

alter table public.topups add column if not exists unique_code int;
alter table public.topups add column if not exists proof_note text;

create or replace function public.request_topup(p_amount bigint) returns table (id bigint, amount bigint, unique_code int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); code int; tries int := 0; new_id bigint;
begin
  if uid is null then raise exception 'Harus login'; end if;
  if p_amount < 1000 or p_amount > 10000000 then raise exception 'Nominal top up Rp 1.000 - Rp 10.000.000'; end if;
  if (select count(*) from public.topups t where t.user_id = uid and t.status = 'pending') >= 3 then
    raise exception 'Masih ada 3 permintaan top up yang belum diproses';
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

drop function if exists public.buy_with_saldo(bigint[]);
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
begin
  if uid is null then raise exception 'Harus login'; end if;
  select count(*), coalesce(sum(price), 0) into cnt, total from public.products where id = any(item_ids) and active;
  if cnt = 0 or total <= 0 then raise exception 'Produk tidak valid'; end if;
  if cnt <> (select count(distinct x) from unnest(item_ids) x) then raise exception 'Ada produk yang sudah tidak tersedia'; end if;

  if voucher_code is not null and btrim(voucher_code) <> '' then
    select v_id, v_discount, v_msg into vid, disc, vmsg from public.calc_voucher(voucher_code, total, uid);
    if vid is null then raise exception '%', coalesce(vmsg, 'Voucher tidak valid'); end if;
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
                               buyer_whatsapp, buyer_contact_email, account_data)
    values (uid, p.id, p.name, p.category, paid, p.period, p.icon, p.tone, p.logo_url,
            case when delivered is not null then 'aktif' else 'pending' end,
            buyer.whatsapp, coalesce(buyer.contact_email, buyer.email), delivered)
    returning id into oid;

    if delivered is not null then update public.product_stock set sold_order_id = oid where id = stock_row.id; end if;
    new_ids := new_ids || oid;
  end loop;

  if buyer.referred_by is not null and not buyer.referral_paid then
    update public.profiles set referral_paid = true where id = uid;
    update public.profiles set saldo = saldo + ref_bonus where id = buyer.referred_by;
  end if;

  return new_ids;
end $$;
grant execute on function public.buy_with_saldo(bigint[], text) to authenticated;

notify pgrst, 'reload schema';
