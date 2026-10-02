-- ════════════════════════════════════════════════════════════════════════
-- Migration v16 — Betabotz Paygate (top up QRIS otomatis)
-- Jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v15.sql,
-- BERSAMAAN dengan deploy kode terbaru (halaman Saldo membaca kolom baru).
--
-- Top up lewat gateway memakai tabel `topups` yang sudah ada (tanpa tabel baru):
--   gateway = 'betabotz'  → dibuat & diselesaikan HANYA oleh backend (service_role).
-- Pemetaan status Betabotz → topups.status:
--   pending→pending | sukses→approved (saldo masuk) | expired→expired | cancel→cancelled | gagal→rejected
-- ════════════════════════════════════════════════════════════════════════

alter table public.topups
  add column if not exists gateway text,
  add column if not exists btz_transaction_id text,
  add column if not exists btz_access_key text,
  add column if not exists payment_url text,
  add column if not exists qris_string text,
  add column if not exists total_amount bigint,      -- nominal yang dibayar customer (amount + unique fee Betabotz)
  add column if not exists gateway_fee bigint,
  add column if not exists expired_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists gateway_response jsonb;   -- respons Betabotz (tanpa API key) untuk debugging

-- Satu transactionId hanya boleh dipakai satu baris top up (cegah klaim ganda).
create unique index if not exists topups_btz_tx_uniq
  on public.topups (btz_transaction_id) where btz_transaction_id is not null;

-- Membuat baris top up gateway. Dipanggil backend dengan service_role (BUKAN dari browser).
create or replace function public.create_gateway_topup(p_uid uuid, p_amount bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if p_uid is null then raise exception 'Harus login'; end if;
  if p_amount < 1000 or p_amount > 10000000 then raise exception 'Nominal top up Rp 1.000 - Rp 10.000.000'; end if;
  perform public.expire_stale_topups();
  if (select count(*) from public.topups t where t.user_id = p_uid and t.status = 'pending') >= 3 then
    raise exception 'Masih ada 3 permintaan top up yang belum diproses. Batalkan yang tidak dipakai.';
  end if;
  insert into public.topups (user_id, amount, status, gateway)
  values (p_uid, p_amount, 'pending', 'betabotz') returning id into new_id;
  return new_id;
end $$;
revoke all on function public.create_gateway_topup(uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_gateway_topup(uuid, bigint) to service_role;

-- Menyelesaikan top up gateway yang SUDAH DIVERIFIKASI backend langsung ke Betabotz.
-- Idempoten & atomik: UPDATE bersyarat status → hanya satu pemanggil yang bisa mengubah
-- pending/expired menjadi approved, jadi saldo tidak pernah bertambah dua kali
-- (callback ganda, polling bersamaan, atau admin yang menyetujui manual).
create or replace function public.settle_gateway_topup(
  p_topup_id bigint, p_txid text, p_paid_amount bigint, p_paid_at timestamptz, p_response jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.topups; cur text;
begin
  update public.topups
     set status = 'approved', paid_at = coalesce(p_paid_at, now()), gateway_response = p_response
   where id = p_topup_id and gateway = 'betabotz' and btz_transaction_id = p_txid
     and amount = p_paid_amount and status in ('pending', 'expired')
  returning * into t;
  if t.id is null then
    select status into cur from public.topups where id = p_topup_id;
    return jsonb_build_object('credited', false, 'status', cur);
  end if;
  update public.profiles set saldo = saldo + t.amount where id = t.user_id;
  return jsonb_build_object('credited', true, 'status', 'approved', 'user_id', t.user_id, 'amount', t.amount);
end $$;
revoke all on function public.settle_gateway_topup(bigint, text, bigint, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.settle_gateway_topup(bigint, text, bigint, timestamptz, jsonb) to service_role;

-- User tidak boleh membatalkan top up gateway langsung di database (transaksi di Betabotz
-- masih bisa terbayar). Pembatalan lewat /api/btz-cancel yang membatalkan di Betabotz dulu.
create or replace function public.cancel_topup(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Harus login'; end if;
  update public.topups set status = 'cancelled'
   where id = p_id and user_id = auth.uid() and status = 'pending' and btz_transaction_id is null and gateway is null;
  if not found then raise exception 'Permintaan tidak ditemukan atau sudah diproses'; end if;
end $$;
revoke all on function public.cancel_topup(bigint) from public, anon;
grant execute on function public.cancel_topup(bigint) to authenticated;
