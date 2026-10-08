-- pgTAP: RPC top up gateway Betabotz (migration_v16). Jalankan: supabase test db
-- Memeriksa: saldo bertambah tepat sekali (idempoten), id/nominal/gateway salah tidak mengkredit,
-- hak eksekusi hanya service_role, klien tidak bisa INSERT langsung, batas 3 top up pending.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Fixture: dua user (profil dibuat trigger handle_new_user).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'pgtap-a@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'pgtap-b@example.test');

create temp table fx as
with ins as (
  insert into public.topups (user_id, amount, status, gateway, btz_transaction_id)
  values ('00000000-0000-0000-0000-0000000000a1', 50000, 'pending', 'betabotz', 'TXTEST000001')
  returning id
) select id from ins;

create temp table fx_manual as
with ins as (
  insert into public.topups (user_id, amount, status, btz_transaction_id)  -- gateway NULL = bukan top up gateway
  values ('00000000-0000-0000-0000-0000000000a1', 70000, 'pending', 'TXTEST000002')
  returning id
) select id from ins;

-- 1
select is((select saldo from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint, 'saldo awal 0');

-- 2-4: percobaan yang harus ditolak
select is((public.settle_gateway_topup((select id from fx), 'TXSALAH00001', 50000, null, '{}'::jsonb) ->> 'credited')::boolean, false, 'transactionId salah → tidak dikredit');
select is((public.settle_gateway_topup((select id from fx), 'TXTEST000001', 49999, null, '{}'::jsonb) ->> 'credited')::boolean, false, 'nominal salah → tidak dikredit');
select is((select saldo from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 0::bigint, 'saldo tetap 0 setelah percobaan tertolak');

-- 5-7: pelunasan yang benar
select is((public.settle_gateway_topup((select id from fx), 'TXTEST000001', 50000, null, '{"ok":true}'::jsonb) ->> 'credited')::boolean, true, 'pelunasan valid → dikredit');
select is((select saldo from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 50000::bigint, 'saldo bertambah sebesar nominal');
select is((select status from public.topups where id = (select id from fx)), 'approved', 'status top up approved');

-- 8-9: idempoten (callback ganda / polling bersamaan)
select is((public.settle_gateway_topup((select id from fx), 'TXTEST000001', 50000, null, '{}'::jsonb) ->> 'credited')::boolean, false, 'panggilan kedua tidak mengkredit lagi');
select is((select saldo from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 50000::bigint, 'saldo tetap 50000');

-- 10: baris non-gateway tidak boleh diselesaikan lewat RPC gateway
select is((public.settle_gateway_topup((select id from fx_manual), 'TXTEST000002', 70000, null, '{}'::jsonb) ->> 'credited')::boolean, false, 'top up non-gateway tidak bisa di-settle lewat RPC gateway');

-- 11-15: hak akses
select is(has_function_privilege('anon', 'public.settle_gateway_topup(bigint,text,bigint,timestamptz,jsonb)', 'execute'), false, 'anon tidak boleh settle');
select is(has_function_privilege('authenticated', 'public.settle_gateway_topup(bigint,text,bigint,timestamptz,jsonb)', 'execute'), false, 'authenticated tidak boleh settle');
select is(has_function_privilege('service_role', 'public.settle_gateway_topup(bigint,text,bigint,timestamptz,jsonb)', 'execute'), true, 'service_role boleh settle');
select is(has_function_privilege('authenticated', 'public.create_gateway_topup(uuid,bigint)', 'execute'), false, 'authenticated tidak boleh create_gateway_topup');
select is(has_table_privilege('authenticated', 'public.topups', 'insert'), false, 'authenticated tidak bisa INSERT langsung ke topups');

-- 16-19: batas 3 top up pending per user (user b)
select lives_ok($$select public.create_gateway_topup('00000000-0000-0000-0000-0000000000a2', 10000)$$, 'top up pending ke-1');
select lives_ok($$select public.create_gateway_topup('00000000-0000-0000-0000-0000000000a2', 10000)$$, 'top up pending ke-2');
select lives_ok($$select public.create_gateway_topup('00000000-0000-0000-0000-0000000000a2', 10000)$$, 'top up pending ke-3');
select throws_ok($$select public.create_gateway_topup('00000000-0000-0000-0000-0000000000a2', 10000)$$, 'P0001', null, 'top up pending ke-4 ditolak');

select * from finish();
rollback;
