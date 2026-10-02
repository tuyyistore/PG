-- Metode pembayaran lain (GoPay, OVO, bank, dll.) yang tampil di bawah QRIS pada halaman Saldo.
-- Logo, nama, nomor, dan atas nama diatur admin di Dashboard Admin → Metode Bayar.
-- Jalankan di Supabase → SQL Editor (sekali saja).

create table if not exists public.payment_methods (
  id bigint generated always as identity primary key,
  name text not null,                       -- nama bank / e-wallet, mis. "GoPay"
  account_number text not null default '',  -- nomor rekening / nomor e-wallet
  account_name text not null default '',    -- atas nama (a.n.)
  logo_url text,                            -- URL logo (diunggah ke bucket publik "products", folder payment/)
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;

-- Pengunjung hanya melihat metode aktif; admin melihat semuanya.
drop policy if exists "metode bayar: publik" on public.payment_methods;
create policy "metode bayar: publik" on public.payment_methods for select using (active or public.is_admin());

drop policy if exists "metode bayar: admin kelola" on public.payment_methods;
create policy "metode bayar: admin kelola" on public.payment_methods for all using (public.is_admin()) with check (public.is_admin());

grant select on public.payment_methods to anon, authenticated;
grant insert, update, delete on public.payment_methods to authenticated;

-- Isi awal: 7 metode. Nomor masih kosong → belum tampil ke user sampai admin mengisinya.
insert into public.payment_methods (name, sort)
select v.name, v.sort
from (values ('GoPay', 0), ('OVO', 1), ('SuperBank', 2), ('SeaBank', 3), ('Mandiri', 4), ('DANA', 5), ('Allobank', 6)) as v(name, sort)
where not exists (select 1 from public.payment_methods);
