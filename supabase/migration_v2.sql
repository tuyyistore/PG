-- ════════════════════════════════════════════════════════════════════════
-- Migration v2 — jalankan SEKALI di Supabase → SQL Editor, SETELAH schema.sql
-- Menambahkan: pengaturan profil (nama/foto/WhatsApp/email kontak), data akun
-- pada pesanan, kategori produk dinamis, logo produk, dan fungsi admin untuk
-- tambah saldo / refund langsung ke dompet user.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Profil: WhatsApp & email kontak (dipakai untuk isi otomatis saat beli) ──
alter table public.profiles add column if not exists whatsapp text;
alter table public.profiles add column if not exists contact_email text;

drop policy if exists "profil: update sendiri" on public.profiles;
create policy "profil: update sendiri" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ── 2. Pesanan: data akun yang dikirim admin + kontak pembeli saat itu ──
alter table public.orders add column if not exists account_data text;
alter table public.orders add column if not exists buyer_whatsapp text;
alter table public.orders add column if not exists buyer_contact_email text;

-- ── 3. Kategori produk (dikelola admin, dipakai di form tambah/edit produk) ──
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort int not null default 0
);
alter table public.categories enable row level security;
drop policy if exists "kategori: publik" on public.categories;
create policy "kategori: publik" on public.categories for select using (true);
drop policy if exists "kategori: admin kelola" on public.categories;
create policy "kategori: admin kelola" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());
insert into public.categories (name, sort) values ('VPS', 0), ('Panel', 1), ('Jasa', 2)
  on conflict (name) do nothing;

-- ── 4. Logo produk (URL gambar, opsional — kalau kosong pakai ikon) ──
alter table public.products add column if not exists logo_url text;

-- ── 5. Admin tambah/kurangi saldo user langsung (top up manual & refund) ──
create or replace function public.admin_adjust_saldo(target_uid uuid, delta bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh mengubah saldo'; end if;
  update public.profiles set saldo = greatest(saldo + delta, 0) where id = target_uid;
end $$;
grant execute on function public.admin_adjust_saldo(uuid, bigint) to authenticated;

-- ── 6. buy_with_saldo diperbarui: salin kontak pembeli ke pesanan ──
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
  insert into public.orders (user_id, product_name, category, price, period, icon, tone, status, buyer_whatsapp, buyer_contact_email)
  select uid, name, category, price, period, icon, tone, 'aktif', buyer.whatsapp, coalesce(buyer.contact_email, buyer.email)
  from public.products where id = any(item_ids) and active;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;

-- ── 7. Storage: bucket foto profil & logo produk, limit dinaikkan ke 10 MB ──
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

insert into storage.buckets (id, name, public, file_size_limit)
values ('products', 'products', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "avatars publik" on storage.objects;
create policy "avatars publik" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars upload sendiri" on storage.objects;
create policy "avatars upload sendiri" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
drop policy if exists "avatars update sendiri" on storage.objects;
create policy "avatars update sendiri" on storage.objects for update to authenticated using (bucket_id = 'avatars');

drop policy if exists "logo produk publik" on storage.objects;
create policy "logo produk publik" on storage.objects for select using (bucket_id = 'products');
drop policy if exists "logo produk admin upload" on storage.objects;
create policy "logo produk admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());
drop policy if exists "logo produk admin update" on storage.objects;
create policy "logo produk admin update" on storage.objects for update to authenticated
  using (bucket_id = 'products' and public.is_admin());

-- Selesai. Muat ulang schema cache PostgREST kalau kolom baru belum kelihatan:
notify pgrst, 'reload schema';
