-- ════════════════════════════════════════════════════════════════════════
-- Migration v8 — jalankan SEKALI di Supabase → SQL Editor, SETELAH migration_v7.sql
-- Mengganti integrasi payment gateway dari GoBiz (polling histori transaksi GoPay
-- Merchant + nominal unik kode 1-99) ke DOKU (Checkout API, transaksi dilacak
-- lewat invoice_number sendiri lewat api/create-payment.js & api/check-payment.js).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Kolom baru di payments untuk menyimpan referensi transaksi DOKU ──────
alter table public.payments add column if not exists doku_invoice_number text;
alter table public.payments add column if not exists doku_payment_url text;
create unique index if not exists payments_doku_invoice_key on public.payments (doku_invoice_number) where doku_invoice_number is not null;

-- ── 2. Nominal unik (kode 1-99) sudah tidak diperlukan — DOKU melacak per invoice ──
alter table public.payments drop constraint if exists payments_topup_unique_code_chk;
drop index if exists payments_pending_amount_idx;

-- rpc/create_topup_payment sudah digantikan oleh api/create-payment.js (perlu
-- memanggil DOKU sebelum baris payment dianggap siap, jadi tidak bisa lagi jadi
-- fungsi database murni) — cabut aksesnya dari klien.
revoke all on function public.create_topup_payment(bigint) from public, anon, authenticated;
drop function if exists public.create_topup_payment(bigint);

-- ── 3. Tabel klaim transaksi: ganti gobiz_claimed_tx → doku_claimed_tx ──────
create table if not exists public.doku_claimed_tx (
  tx_id text primary key,          -- id transaksi DOKU (original_request_id) yang sudah dipakai, cegah klaim ganda
  payment_id bigint references public.payments(id),
  amount bigint not null,
  claimed_at timestamptz not null default now()
);
alter table public.doku_claimed_tx enable row level security;
-- Tidak ada policy sama sekali → tabel ini hanya bisa diakses service_role.

-- ── 4. settle_payment: pakai doku_claimed_tx, tanpa perhitungan kode unik lagi ──
create or replace function public.settle_payment(p_payment_id bigint, p_tx_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then return 'not_found'; end if;
  if p.status = 'paid' then return 'already_paid'; end if;
  if p.status <> 'pending' then return p.status; end if;

  -- Klaim transaksi DOKU. tx_id adalah primary key → satu transaksi hanya bisa
  -- dipakai untuk satu payment, walau dua payment berbeda mencoba bersamaan.
  insert into public.doku_claimed_tx (tx_id, payment_id, amount)
  values (p_tx_id, p.id, p.amount)
  on conflict (tx_id) do nothing;
  if not found then return 'tx_already_claimed'; end if;

  if p.kind = 'topup' then
    insert into public.topups (user_id, amount, status) values (p.user_id, p.amount, 'approved');
    update public.profiles set saldo = saldo + p.amount where id = p.user_id;
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

revoke all on function public.settle_payment(bigint, text) from public, anon, authenticated;
grant execute on function public.settle_payment(bigint, text) to service_role;

-- ── 5. Bersih-bersih sisa infrastruktur GoBiz yang sudah tidak dipakai ──────
drop table if exists public.gobiz_claimed_tx;
drop table if exists public.gobiz_session;

notify pgrst, 'reload schema';
