-- ─── Migration v4: nominal unik QRIS dibuat di server ─────────────────────────
-- Sebelumnya browser membuat kode unik (1–99) sendiri lalu INSERT langsung ke tabel
-- `payments`. Akibatnya pengguna bisa mengirim `amount` dan `payload.amount` bebas
-- (mis. bayar Rp 10.001 tapi payload.amount = 1.000.000 → saldo bertambah 1 juta).
--
-- Setelah migration ini:
--  1. Klien TIDAK bisa lagi INSERT langsung ke `payments` (policy insert dihapus).
--  2. Top up hanya lewat RPC `create_topup_payment(base_amount)`: server memvalidasi
--     nominal, memilih kode unik 1–99 yang belum dipakai payment pending lain dalam
--     60 menit terakhir, lalu menyimpan payment-nya.
--  3. Constraint tambahan memastikan selisih amount − payload.amount selalu 1–99.
--
-- Jalankan sekali di Supabase → SQL Editor (setelah schema, v2, v3).

-- 1) Tutup jalur INSERT langsung dari klien
drop policy if exists "payment: buat sendiri" on public.payments;

-- 2) Index untuk pencarian kode unik yang sedang dipakai
create index if not exists payments_pending_amount_idx
  on public.payments (amount)
  where status = 'pending';

-- 3) Fungsi pembuat payment top up
create or replace function public.create_topup_payment(base_amount bigint)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  min_amount constant bigint := 1000;        -- Rp 1.000
  max_amount constant bigint := 10000000;    -- Rp 10.000.000 (batas umum QRIS per transaksi)
  code int;
  result public.payments;
begin
  if uid is null then raise exception 'Harus login'; end if;
  if base_amount is null or base_amount < min_amount then
    raise exception 'Nominal minimal Rp %', replace(to_char(min_amount, 'FM999,999,999'), ',', '.');
  end if;
  if base_amount > max_amount then
    raise exception 'Nominal maksimal Rp %', replace(to_char(max_amount, 'FM999,999,999'), ',', '.');
  end if;

  -- Kunci per-transaksi supaya dua request bersamaan tidak memilih kode yang sama.
  perform pg_advisory_xact_lock(hashtext('public.create_topup_payment'));

  -- Tandai payment pending yang sudah > 60 menit sebagai expired (sama seperti api/check-payment.js),
  -- supaya kodenya bisa dipakai lagi.
  update public.payments
     set status = 'expired'
   where status = 'pending'
     and created_at < now() - interval '60 minutes';

  -- Pilih kode acak 1–99 yang nominal akhirnya belum dipakai payment pending mana pun.
  select c into code
    from generate_series(1, 99) as c
   where not exists (
     select 1 from public.payments p
      where p.status = 'pending'
        and p.amount = base_amount + c
   )
   order by random()
   limit 1;

  if code is null then
    raise exception 'Sedang banyak transaksi dengan nominal ini. Coba nominal lain atau ulangi beberapa menit lagi.';
  end if;

  insert into public.payments (user_id, kind, amount, status, payload)
  values (uid, 'topup', base_amount + code, 'pending', jsonb_build_object('amount', base_amount))
  returning * into result;

  return result;
end;
$$;

revoke all on function public.create_topup_payment(bigint) from public, anon;
grant execute on function public.create_topup_payment(bigint) to authenticated;

-- 4) Pengaman tambahan: untuk top up, selisih nominal bayar vs nominal dasar harus 1–99.
--    NOT VALID = baris lama tidak dicek ulang, hanya baris baru.
alter table public.payments drop constraint if exists payments_topup_unique_code_chk;
alter table public.payments
  add constraint payments_topup_unique_code_chk
  check (
    kind <> 'topup'
    or (
      (payload ? 'amount')
      and (payload->>'amount') ~ '^[0-9]+$'
      and amount - (payload->>'amount')::bigint between 1 and 99
    )
  ) not valid;
