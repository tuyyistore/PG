-- ════════════════════════════════════════════════════════════════════════
-- Migration v13 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v12.sql
-- JALANKAN BERSAMAAN dengan deploy kode terbaru (buy_with_saldo kini bisa
-- mengembalikan array kosong saat voucher gagal, dan ada status pesanan baru).
--
--  1. Storage: foto profil hanya bisa ditulis di folder milik sendiri, tipe file dibatasi.
--  2. Voucher & referral: bonus referral butuh pembelian minimal, percobaan voucher dibatasi.
--  3. Pembatalan pesanan + refund yang terhubung (saldo, stok, voucher), status 'dibatalkan'.
--  4. SLA pesanan pending: pengingat ke admin dan (opsional) auto-refund.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Storage ──────────────────────────────────────────────────────────
-- Sebelumnya policy insert/update 'avatars' tidak mengecek pemilik, jadi user mana pun
-- bisa menimpa foto user lain. Sekarang path wajib diawali folder = id user sendiri
-- (kode klien sudah mengunggah ke `${user.id}/...`).
drop policy if exists "avatars upload sendiri" on storage.objects;
create policy "avatars upload sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars update sendiri" on storage.objects;
create policy "avatars update sendiri" on storage.objects for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars hapus sendiri" on storage.objects;
create policy "avatars hapus sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Hanya gambar raster (tanpa SVG/HTML yang bisa memuat skrip). Foto profil maks 2 MB.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
       file_size_limit = 2097152
 where id = 'avatars';
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 where id = 'products';

-- ── 2a. Percobaan voucher dibatasi ──────────────────────────────────────
create table if not exists public.voucher_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists voucher_attempts_user_idx on public.voucher_attempts (user_id, created_at desc);
alter table public.voucher_attempts enable row level security;
revoke all on public.voucher_attempts from anon, authenticated;

-- Maksimal 10 percobaan gagal per 10 menit per user.
create or replace function public.voucher_guard(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.voucher_attempts
       where user_id = p_uid and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Terlalu banyak percobaan voucher, coba lagi dalam beberapa menit';
  end if;
end $$;
revoke all on function public.voucher_guard(uuid) from public, anon, authenticated;

create or replace function public.voucher_fail(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.voucher_attempts (user_id) values (p_uid);
  delete from public.voucher_attempts where user_id = p_uid and created_at < now() - interval '1 hour';
end $$;
revoke all on function public.voucher_fail(uuid) from public, anon, authenticated;

-- Dulu STABLE (tidak bisa menulis). Kini VOLATILE supaya percobaan gagal tercatat.
create or replace function public.check_voucher(p_code text, p_total bigint) returns table (valid boolean, discount bigint, message text)
language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Harus login'; end if;
  perform public.voucher_guard(uid);
  select * into r from public.calc_voucher(p_code, p_total, uid);
  if r.v_id is null and btrim(coalesce(p_code, '')) <> '' then
    perform public.voucher_fail(uid);
  end if;
  return query select (r.v_id is not null), r.v_discount, r.v_msg;
end $$;
grant execute on function public.check_voucher(text, bigint) to authenticated;

-- ── 3a. Skema pembatalan pesanan ────────────────────────────────────────
-- Tambah status 'dibatalkan' (hapus check constraint status lama apa pun namanya).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'aktif', 'nonaktif', 'dibatalkan'));

alter table public.orders add column if not exists voucher_id bigint references public.vouchers(id) on delete set null;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancel_reason text;
alter table public.orders add column if not exists refunded_amount bigint not null default 0;
create index if not exists orders_pending_idx on public.orders (created_at) where status = 'pending';

-- Status 'dibatalkan' hanya boleh lewat cancel_order (supaya refund tidak terlewat),
-- dan pesanan yang sudah dibatalkan tidak bisa dihidupkan lagi (cegah refund ganda).
create or replace function public.trg_orders_guard_cancel() returns trigger
language plpgsql as $$
begin
  if new.status = 'dibatalkan' and old.status is distinct from 'dibatalkan'
     and coalesce(current_setting('app.cancelling', true), '') <> '1' then
    raise exception 'Gunakan tombol Batalkan & Refund untuk membatalkan pesanan';
  end if;
  if old.status = 'dibatalkan' and new.status is distinct from 'dibatalkan' then
    raise exception 'Pesanan yang sudah dibatalkan tidak bisa diaktifkan lagi';
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_cancel on public.orders;
create trigger orders_guard_cancel before update on public.orders
  for each row execute function public.trg_orders_guard_cancel();

-- ── 3b. Inti pembatalan (internal, dipakai admin dan proses otomatis) ──
--   p_refund  : kembalikan harga yang dibayar ke saldo user
--   p_restock : kembalikan stok (angka stok, atau data akun auto-delivery ke daftar stok).
--               Untuk auto-delivery, data akun yang dikembalikan ke stok dikosongkan dari pesanan.
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

  -- Voucher dikembalikan kalau semua pesanan user yang memakainya sudah dibatalkan.
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

  perform public.enqueue_wa(o.buyer_whatsapp,
    'Pesanan ' || o.order_code || ' (' || o.product_name || ') dibatalkan.'
    || case when v_reason is not null then ' Alasan: ' || v_reason || '.' else '' end, 'pesanan');

  return jsonb_build_object('order_code', o.order_code, 'refunded', refund, 'restocked', p_restock);
end $$;
revoke all on function public._cancel_order_core(bigint, text, boolean, boolean) from public, anon, authenticated;

-- ── 3c. Dipanggil dari Admin → Pesanan ──────────────────────────────────
create or replace function public.cancel_order(
  p_order_id bigint, p_reason text default null, p_refund boolean default true, p_restock boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh membatalkan pesanan'; end if;
  return public._cancel_order_core(p_order_id, p_reason, p_refund, p_restock);
end $$;
revoke all on function public.cancel_order(bigint, text, boolean, boolean) from public, anon;
grant execute on function public.cancel_order(bigint, text, boolean, boolean) to authenticated;

-- ── 2b. buy_with_saldo: voucher dibatasi, bonus referral butuh belanja minimal ──
-- Kontrak baru: kalau voucher gagal, fungsi MENGEMBALIKAN ARRAY KOSONG (bukan error)
-- supaya percobaan gagal tetap tercatat (error akan me-rollback pencatatannya).
-- Klien harus memperlakukan array kosong sebagai "voucher tidak berlaku".
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
  ref_min constant bigint := 10000;   -- belanja bersih minimal agar bonus referral cair
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

  if buyer.referred_by is not null and not buyer.referral_paid and net >= ref_min then
    update public.profiles set referral_paid = true where id = uid;
    update public.profiles set saldo = saldo + ref_bonus where id = buyer.referred_by;
  end if;

  return new_ids;
end $$;
grant execute on function public.buy_with_saldo(bigint[], text) to authenticated;

-- ── 4. SLA pesanan pending ──────────────────────────────────────────────
--   pending_sla_hours        : lewat berapa jam pesanan pending dianggap terlambat (pengingat ke WA admin)
--   pending_autorefund_hours : lewat berapa jam pesanan pending dibatalkan + refund otomatis (0 = nonaktif)
insert into public.app_settings (key, value) values ('pending_sla_hours', '24'), ('pending_autorefund_hours', '0')
  on conflict do nothing;

create or replace function public.setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when s.value ~ '^\d{1,6}$' then s.value::int end from public.app_settings s where s.key = p_key), p_default)
$$;
revoke all on function public.setting_int(text, int) from public, anon, authenticated;

create or replace function public.process_stale_pending_orders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sla int := public.setting_int('pending_sla_hours', 24);
  auto int := public.setting_int('pending_autorefund_hours', 0);
  o record;
  n_refunded int := 0;
  n_late int := 0;
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

  return jsonb_build_object('late', n_late, 'auto_refunded', n_refunded);
end $$;
revoke all on function public.process_stale_pending_orders() from public, anon, authenticated;

-- Jadwalkan dengan pg_cron (Supabase → Database → Extensions → aktifkan pg_cron), mis. tiap 6 jam:
--   select cron.schedule('stale-pending-orders', '0 */6 * * *', $$select public.process_stale_pending_orders()$$);
-- Atau jalankan manual kapan saja di SQL Editor:
--   select public.process_stale_pending_orders();

notify pgrst, 'reload schema';
