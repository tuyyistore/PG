-- ════════════════════════════════════════════════════════════════════════
-- Migration v10 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v9.sql
-- Kode order acak & unik (mis. ORD-K7M2QX9P) menggantikan ID berurutan (ORD-12).
--   • 1 pesanan/produk = 1 kode unik (UNIQUE constraint di database).
--   • Kode dibuat otomatis oleh trigger saat pesanan dibuat (tidak bisa diisi/diubah dari client).
--   • Pesanan lama otomatis mendapat kode baru.
-- Tidak perlu mengubah fungsi buy_with_saldo.
-- ════════════════════════════════════════════════════════════════════════

alter table public.orders add column if not exists order_code text;

-- Karakter tanpa yang mirip (0/O, 1/I/L) supaya mudah dibaca & diketik admin.
create or replace function public.gen_order_code() returns text
language plpgsql volatile as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := 'ORD-';
    for i in 1..8 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.orders where order_code = code);
  end loop;
  return code;
end $$;

-- Isi kode untuk pesanan yang sudah ada.
do $$
declare r record;
begin
  for r in select id from public.orders where order_code is null loop
    update public.orders set order_code = public.gen_order_code() where id = r.id;
  end loop;
end $$;

alter table public.orders alter column order_code set not null;
create unique index if not exists orders_order_code_key on public.orders (order_code);

-- Trigger: selalu buat kode baru saat INSERT, dan cegah perubahan kode saat UPDATE.
create or replace function public.orders_set_code() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.order_code := public.gen_order_code();
  else
    new.order_code := old.order_code;
  end if;
  return new;
end $$;

drop trigger if exists orders_set_code on public.orders;
create trigger orders_set_code before insert or update on public.orders
  for each row execute function public.orders_set_code();

notify pgrst, 'reload schema';
