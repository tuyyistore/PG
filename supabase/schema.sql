-- Jalankan di Supabase → SQL Editor (sekali saja).

-- Admin = email Google warungtuyyi@gmail.com (login via provider Google).
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'warungtuyyi@gmail.com'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
$$;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text, full_name text, avatar_url text,
  saldo bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id bigint generated always as identity primary key,
  name text not null, category text not null default 'VPS', tagline text,
  price bigint not null, original_price bigint, period text default '/bln',
  features text[] not null default '{}', badge text, popular boolean not null default false,
  icon text not null default 'zap', tone text not null default 'blue',
  active boolean not null default true, sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.orders (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  product_name text not null, category text, price bigint not null, period text,
  icon text default 'package', tone text default 'blue',
  status text not null default 'pending' check (status in ('pending','aktif','nonaktif')),
  created_at timestamptz not null default now()
);

create table public.topups (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- Profil otomatis dibuat saat user pertama kali login Google.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
          new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.topups   enable row level security;

create policy "profil: sendiri/admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "produk: publik"        on public.products for select using (active or public.is_admin());
create policy "produk: admin kelola"  on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "order: lihat"          on public.orders   for select using (user_id = auth.uid() or public.is_admin());
create policy "order: buat sendiri"   on public.orders   for insert with check (user_id = auth.uid() and status = 'pending');
create policy "order: admin ubah"     on public.orders   for update using (public.is_admin()) with check (public.is_admin());
create policy "topup: lihat"          on public.topups   for select using (user_id = auth.uid() or public.is_admin());
create policy "topup: buat sendiri"   on public.topups   for insert with check (user_id = auth.uid() and status = 'pending');
create policy "topup: admin ubah"     on public.topups   for update using (public.is_admin()) with check (public.is_admin());

-- Saldo hanya bisa bertambah lewat persetujuan admin.
create or replace function public.approve_topup(tid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare t public.topups;
begin
  if not public.is_admin() then raise exception 'Hanya admin yang boleh menyetujui'; end if;
  update public.topups set status = 'approved' where id = tid and status = 'pending' returning * into t;
  if t.id is null then raise exception 'Top up tidak ditemukan atau sudah diproses'; end if;
  update public.profiles set saldo = saldo + t.amount where id = t.user_id;
end $$;
grant execute on function public.approve_topup(bigint) to authenticated;

-- ── Integrasi GoBiz Payment (auto-konfirmasi QRIS via polling transaksi GoPay Merchant) ──

create table public.payments (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('order','topup')),
  amount bigint not null check (amount > 0),          -- nominal unik yang tampil di QR (dasar + kode unik 1-99)
  status text not null default 'pending' check (status in ('pending','paid','expired')),
  payload jsonb not null default '{}'::jsonb,          -- kind=order: array item cart; kind=topup: {amount: nominal dasar}
  matched_tx_id text,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "payment: lihat sendiri"  on public.payments for select using (user_id = auth.uid() or public.is_admin());
create policy "payment: buat sendiri"   on public.payments for insert with check (user_id = auth.uid() and status = 'pending');
-- Tidak ada policy update/delete untuk anon/authenticated → hanya service_role (backend) yang bisa mengubah status.

create table public.gobiz_claimed_tx (
  tx_id text primary key,          -- id transaksi GoBiz yang sudah dipakai, cegah klaim ganda
  payment_id bigint references public.payments(id),
  amount bigint not null,
  claimed_at timestamptz not null default now()
);
alter table public.gobiz_claimed_tx enable row level security;
-- Tidak ada policy sama sekali → tabel ini hanya bisa diakses service_role.

create table public.gobiz_session (
  id int primary key default 1 check (id = 1),   -- single-row: token & merchant id GoBiz saat ini
  token text,
  merchant_id text,
  updated_at timestamptz not null default now()
);
alter table public.gobiz_session enable row level security;
-- Tidak ada policy sama sekali → hanya service_role yang bisa baca/tulis sesi ini.

-- Beli produk langsung pakai saldo (tanpa QRIS) — dicek & dipotong di server, tidak bisa dimanipulasi dari klien.
create or replace function public.buy_with_saldo(item_ids bigint[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  total bigint;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Harus login'; end if;
  select coalesce(sum(price), 0) into total from public.products where id = any(item_ids) and active;
  if total <= 0 then raise exception 'Produk tidak valid'; end if;
  if (select saldo from public.profiles where id = uid) < total then
    raise exception 'Saldo tidak cukup';
  end if;
  update public.profiles set saldo = saldo - total where id = uid;
  insert into public.orders (user_id, product_name, category, price, period, icon, tone, status)
  select uid, name, category, price, period, icon, tone, 'aktif' from public.products where id = any(item_ids) and active;
end $$;
grant execute on function public.buy_with_saldo(bigint[]) to authenticated;
