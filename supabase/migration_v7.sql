-- ════════════════════════════════════════════════════════════════════════
-- Migration v7 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v6.sql
-- Integrasi H2H PREFLIX (https://h2h.preflix.my.id/app/doc/):
--   1. Produk bisa ditandai berasal dari Preflix (supplier + supplier_product_id),
--      disinkron lewat POST /api/admin-sync-preflix (tombol "Sync dari Preflix" di
--      Dashboard Admin).
--   2. Pesanan menyimpan product_id (dulu tidak ada — hanya salinan nama/harga),
--      supaya /api/fulfill-order tahu produk itu dari Preflix atau bukan.
--   3. buy_with_saldo() sekarang mengembalikan id pesanan yang baru dibuat, dipakai
--      klien untuk memanggil /api/fulfill-order tepat setelah checkout.
-- Kredensial asli (PREFLIX_ID_USER / PREFLIX_KEY_USER) diisi lewat Environment
-- Variables Vercel, BUKAN di sini — lihat api/_preflix.js.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Produk: penanda asal Preflix ──────────────────────────────────────────
alter table public.products add column if not exists supplier text;
alter table public.products add column if not exists supplier_product_id text;
alter table public.products add column if not exists supplier_stock int;
create unique index if not exists products_supplier_unique
  on public.products (supplier, supplier_product_id) where supplier is not null;

-- ── 2. Pesanan: link ke produk + status fulfillment otomatis ────────────────
alter table public.orders add column if not exists product_id bigint references public.products(id) on delete set null;
alter table public.orders add column if not exists supplier_stock_id text;
alter table public.orders add column if not exists fulfillment_status text not null default 'n/a'
  check (fulfillment_status in ('n/a', 'pending', 'fulfilled', 'failed'));

-- ── 3. buy_with_saldo: sertakan product_id, tandai fulfillment_status, dan
--       kembalikan id pesanan yang baru dibuat ───────────────────────────────
create or replace function public.buy_with_saldo(item_ids bigint[]) returns bigint[]
language plpgsql security definer set search_path = public as $$
declare
  total bigint;
  uid uuid := auth.uid();
  buyer record;
  new_ids bigint[];
begin
  if uid is null then raise exception 'Harus login'; end if;
  select coalesce(sum(price), 0) into total from public.products where id = any(item_ids) and active;
  if total <= 0 then raise exception 'Produk tidak valid'; end if;
  update public.profiles set saldo = saldo - total
   where id = uid and saldo >= total
  returning * into buyer;
  if not found then raise exception 'Saldo tidak cukup'; end if;

  with ins as (
    insert into public.orders (user_id, product_id, product_name, category, price, period, icon, tone,
                               logo_url, status, buyer_whatsapp, buyer_contact_email, fulfillment_status)
    select uid, p.id, p.name, p.category, p.price, p.period, p.icon, p.tone, p.logo_url, 'aktif',
           buyer.whatsapp, coalesce(buyer.contact_email, buyer.email),
           case when p.supplier is not null then 'pending' else 'n/a' end
      from public.products p where p.id = any(item_ids) and p.active
    returning id
  )
  select array_agg(id) into new_ids from ins;

  return new_ids;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;

notify pgrst, 'reload schema';
