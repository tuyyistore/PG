-- ════════════════════════════════════════════════════════════════════════
-- Migration v9 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v8.sql
-- Menghapus integrasi DOKU (payment gateway) dan PREFLIX (supplier produk H2H):
--   1. Semua produk hasil sync Preflix dihapus dari tabel products.
--   2. buy_with_saldo() tidak lagi menandai fulfillment otomatis.
--   3. Kolom/tabel/fungsi khusus Preflix & DOKU dibuang.
-- Riwayat pesanan lama tetap ada (orders.product_id jadi NULL untuk produk yang dihapus).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Hapus produk yang berasal dari Preflix ──────────────────────────────
delete from public.products where supplier = 'preflix';

-- ── 2. buy_with_saldo: versi tanpa fulfillment_status (harus sebelum drop kolom) ──
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
                               logo_url, status, buyer_whatsapp, buyer_contact_email)
    select uid, p.id, p.name, p.category, p.price, p.period, p.icon, p.tone, p.logo_url, 'aktif',
           buyer.whatsapp, coalesce(buyer.contact_email, buyer.email)
      from public.products p where p.id = any(item_ids) and p.active
    returning id
  )
  select array_agg(id) into new_ids from ins;

  return new_ids;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;

-- ── 3. Buang kolom khusus Preflix ──────────────────────────────────────────
drop index if exists public.products_supplier_unique;
alter table public.products drop column if exists supplier;
alter table public.products drop column if exists supplier_product_id;
alter table public.products drop column if exists supplier_stock;
alter table public.orders drop column if exists supplier_stock_id;
alter table public.orders drop column if exists fulfillment_status;

-- ── 4. Buang infrastruktur DOKU ────────────────────────────────────────────
drop function if exists public.settle_payment(bigint, text);
drop table if exists public.doku_claimed_tx;
drop index if exists public.payments_doku_invoice_key;
alter table public.payments drop column if exists doku_invoice_number;
alter table public.payments drop column if exists doku_payment_url;

notify pgrst, 'reload schema';
