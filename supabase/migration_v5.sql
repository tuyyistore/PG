-- ─── Migration v5: saldo tidak bisa dobel / dimanipulasi ──────────────────────
-- Jalankan sekali di Supabase → SQL Editor, SETELAH migration_v4.sql.
--
-- 1. settle_payment(): konfirmasi pembayaran QRIS dalam SATU transaksi database.
--    Sebelumnya api/check-payment.js membaca saldo lalu menulis ulang (read-modify-write)
--    dan mengabaikan error saat klaim transaksi GoBiz. Dua polling bersamaan bisa
--    sama-sama menambah saldo / membuat pesanan dua kali.
-- 2. Profil: pengguna hanya boleh mengubah kolom nama, foto, WhatsApp, email kontak.
--    Sebelumnya policy "profil: update sendiri" mengizinkan UPDATE kolom apa pun,
--    termasuk `saldo`.
-- 3. buy_with_saldo(): potong saldo secara atomik (tidak bisa minus lewat dua
--    pembelian bersamaan).
-- 4. Pengguna tidak bisa lagi membuat baris `orders` / `topups` sendiri lewat API.
--    Semua baris sah dibuat oleh fungsi server (buy_with_saldo, settle_payment).

-- ── 1. Konfirmasi pembayaran atomik ──────────────────────────────────────────
create or replace function public.settle_payment(p_payment_id bigint, p_tx_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.payments;
  base bigint;
begin
  -- Kunci baris payment: polling paralel untuk payment yang sama akan antre di sini.
  select * into p from public.payments where id = p_payment_id for update;
  if not found then return 'not_found'; end if;
  if p.status = 'paid' then return 'already_paid'; end if;
  if p.status <> 'pending' then return p.status; end if;

  -- Klaim transaksi GoBiz. tx_id adalah primary key → satu transaksi hanya bisa
  -- dipakai untuk satu payment, walau dua payment berbeda mencoba bersamaan.
  insert into public.gobiz_claimed_tx (tx_id, payment_id, amount)
  values (p_tx_id, p.id, p.amount)
  on conflict (tx_id) do nothing;
  if not found then return 'tx_already_claimed'; end if;

  if p.kind = 'topup' then
    base := (p.payload->>'amount')::bigint;
    if base is null or base <= 0 or p.amount - base not between 1 and 99 then
      raise exception 'Payment top up % tidak valid', p.id;
    end if;
    insert into public.topups (user_id, amount, status) values (p.user_id, base, 'approved');
    update public.profiles set saldo = saldo + base where id = p.user_id;
    if not found then raise exception 'Profil user % tidak ditemukan', p.user_id; end if;

  elsif p.kind = 'order' then
    if jsonb_typeof(p.payload) = 'array' and jsonb_array_length(p.payload) > 0 then
      insert into public.orders (user_id, status, product_name, category, price, period, icon, tone,
                                 logo_url, buyer_whatsapp, buyer_contact_email)
      select p.user_id, 'aktif', i.product_name, i.category, i.price, i.period,
             coalesce(i.icon, 'package'), coalesce(i.tone, 'blue'),
             i.logo_url, i.buyer_whatsapp, i.buyer_contact_email
        from jsonb_to_recordset(p.payload) as i(
          product_name text, category text, price bigint, period text, icon text, tone text,
          logo_url text, buyer_whatsapp text, buyer_contact_email text
        );
    end if;
  end if;

  update public.payments set status = 'paid', matched_tx_id = p_tx_id where id = p.id;
  return 'paid';
end;
$$;

-- Hanya backend (service_role) yang boleh memanggil.
revoke all on function public.settle_payment(bigint, text) from public, anon, authenticated;
grant execute on function public.settle_payment(bigint, text) to service_role;

-- ── 2. Profil: batasi kolom yang boleh diubah pengguna ──────────────────────
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, whatsapp, contact_email) on public.profiles to authenticated;

-- ── 3. buy_with_saldo: potong saldo atomik ──────────────────────────────────
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
  -- Cek & potong dalam satu UPDATE: kalau saldo tidak cukup, tidak ada baris yang berubah.
  update public.profiles set saldo = saldo - total
   where id = uid and saldo >= total
  returning * into buyer;
  if not found then raise exception 'Saldo tidak cukup'; end if;
  insert into public.orders (user_id, product_name, category, price, period, icon, tone, logo_url, status, buyer_whatsapp, buyer_contact_email)
  select uid, name, category, price, period, icon, tone, logo_url, 'aktif', buyer.whatsapp, coalesce(buyer.contact_email, buyer.email)
  from public.products where id = any(item_ids) and active;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;

-- Pengaman terakhir: saldo tidak pernah negatif.
alter table public.profiles drop constraint if exists profiles_saldo_nonnegative;
alter table public.profiles add constraint profiles_saldo_nonnegative check (saldo >= 0) not valid;

-- ── 4. Tutup INSERT langsung dari klien ke orders & topups ──────────────────
-- Frontend tidak pernah INSERT ke dua tabel ini; pesanan & top up hanya dibuat oleh
-- fungsi security definer di atas (yang tidak terpengaruh RLS/privilege klien).
drop policy if exists "order: buat sendiri" on public.orders;
drop policy if exists "topup: buat sendiri" on public.topups;
-- Lapis kedua: cabut hak INSERT/DELETE di level tabel (termasuk payments dari v4).
revoke insert, delete on public.orders, public.topups, public.payments from anon, authenticated;

-- Catatan: baris top up `pending` yang sudah ada sebelum migration ini bisa saja dibuat
-- manual lewat API. Periksa dulu sebelum menyetujui, mis.:
--   select t.*, p.email from public.topups t join public.profiles p on p.id = t.user_id
--    where t.status = 'pending' order by t.id desc;

notify pgrst, 'reload schema';
