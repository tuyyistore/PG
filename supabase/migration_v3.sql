-- ════════════════════════════════════════════════════════════════════════
-- Migration v3 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v2.sql
-- Menambahkan: kolom logo_url di pesanan (supaya foto/thumbnail produk yang
-- diunggah admin ikut tampil di Dashboard, Pesanan Saya, dan Detail Pesanan
-- user — bukan lagi ikon bawaan template).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Pesanan: simpan logo_url produk pada saat dibeli ──
alter table public.orders add column if not exists logo_url text;

-- ── 2. buy_with_saldo diperbarui: salin logo_url produk ke pesanan ──
create or replace function public.buy_with_saldo(item_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  total bigint;
  uid uuid := auth.uid();
  buyer record;
begin
  if uid is null then raise exception 'Harus login'; end if;
  select coalesce(sum(price), 0) into total from public.products where id = any(item_ids) and active;
  if total <= 0 then raise exception 'Produk tidak valid'; end if;
  select * into buyer from public.profiles where id = uid;
  if buyer.saldo < total then raise exception 'Saldo tidak cukup'; end if;
  update public.profiles set saldo = saldo - total where id = uid;
  insert into public.orders (user_id, product_name, category, price, period, icon, tone, logo_url, status, buyer_whatsapp, buyer_contact_email)
  select uid, name, category, price, period, icon, tone, logo_url, 'aktif', buyer.whatsapp, coalesce(buyer.contact_email, buyer.email)
  from public.products where id = any(item_ids) and active;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;

-- Selesai. Muat ulang schema cache PostgREST kalau kolom baru belum kelihatan:
notify pgrst, 'reload schema';
