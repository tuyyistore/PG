// Tes handler HTTP Betabotz dengan dependensi palsu (tanpa Supabase/jaringan/Vercel).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCallbackHandler, createStatusHandler, createCancelHandler } from './_btzHandlers.js'
import { createTtlCache } from './_btzLogic.js'
import { passwordError, MIN_PASSWORD_LENGTH } from './_password.js'

function mockRes() {
  return {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}
const logs = () => { const l = []; const fn = (level, event, f) => l.push({ level, event, ...f }); fn.entries = l; return fn }
const okUser = (id = 'u1') => async () => ({ id })
const noUser = async (_req, res) => { res.status(401).json({ error: 'Sesi tidak valid, silakan login ulang.' }); return null }

// ── Callback ────────────────────────────────────────────────────────────────
function callbackSetup(over = {}) {
  const calls = { find: [], sync: [] }
  const handler = createCallbackHandler({
    getSecret: () => 'rahasia-webhook',
    findByTransactionId: async txId => { calls.find.push(txId); return over.topup === undefined ? { id: 7 } : over.topup },
    syncTopup: async t => { calls.sync.push(t); if (over.syncThrows) throw new Error('boom'); return { status: 'approved', changed: true } },
    log: logs(),
    ...over.deps,
  })
  return { handler, calls }
}
const cbReq = (o = {}) => ({ method: 'POST', query: { token: 'rahasia-webhook' }, body: { pay_id: 'TX123456' }, ...o })

test('callback: selain POST → 405', async () => {
  const { handler } = callbackSetup(); const res = mockRes()
  await handler(cbReq({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
})
test('callback: token salah/kosong → 401 dan tidak menyentuh DB/gateway', async () => {
  for (const query of [{ token: 'salah' }, {}, { token: '' }]) {
    const { handler, calls } = callbackSetup(); const res = mockRes()
    await handler(cbReq({ query }), res)
    assert.equal(res.statusCode, 401)
    assert.deepEqual(calls, { find: [], sync: [] })
  }
})
test('callback: secret belum dikonfigurasi → 401 (tidak pernah terbuka)', async () => {
  const { handler } = callbackSetup({ deps: { getSecret: () => undefined } }); const res = mockRes()
  await handler(cbReq({ query: { token: 'apa-saja' } }), res)
  assert.equal(res.statusCode, 401)
})
test('callback: token array → elemen pertama dipakai', async () => {
  const { handler, calls } = callbackSetup(); const res = mockRes()
  await handler(cbReq({ query: { token: ['rahasia-webhook', 'lain'] } }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(calls.sync.length, 1)
})
test('callback: body tanpa transactionId valid → 400', async () => {
  for (const body of [null, {}, { pay_id: 'x' }, 'bukan json {', { pay_id: 123456789 }]) {
    const { handler, calls } = callbackSetup(); const res = mockRes()
    await handler(cbReq({ body }), res)
    assert.equal(res.statusCode, 400)
    assert.equal(calls.find.length, 0)
  }
})
test('callback: body string JSON di-parse', async () => {
  const { handler, calls } = callbackSetup(); const res = mockRes()
  await handler(cbReq({ body: JSON.stringify({ pay_id: 'TX123456' }) }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(calls.find, ['TX123456'])
})
test('callback: transaksi tak dikenal → 200 (jangan dipaksa retry) tanpa sync', async () => {
  const { handler, calls } = callbackSetup({ topup: null }); const res = mockRes()
  await handler(cbReq(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(calls.sync.length, 0)
})
test('callback: sukses → sync dipanggil sekali, 200', async () => {
  const { handler, calls } = callbackSetup(); const res = mockRes()
  await handler(cbReq(), res)
  assert.deepEqual(res.body, { success: true })
  assert.equal(calls.sync.length, 1)
})
test('callback: sync gagal → 502 agar gateway mengulang', async () => {
  const { handler } = callbackSetup({ syncThrows: true }); const res = mockRes()
  await handler(cbReq(), res)
  assert.equal(res.statusCode, 502)
})

// ── Status ──────────────────────────────────────────────────────────────────
function statusSetup({ topup = { id: 5, status: 'pending' }, result = { status: 'pending' }, requireUser = okUser(), clock } = {}) {
  const calls = { find: 0, sync: 0 }
  const handler = createStatusHandler({
    requireUser,
    findOwned: async (id, uid) => { calls.find++; calls.last = { id, uid }; return topup },
    syncTopup: async () => { calls.sync++; return typeof result === 'function' ? result() : result },
    log: logs(),
    now: clock,
  })
  return { handler, calls }
}
const stReq = (id, method = 'GET') => ({ method, query: { id: String(id) } })

test('status: tanpa sesi → 401 dari requireUser', async () => {
  const { handler, calls } = statusSetup({ requireUser: noUser }); const res = mockRes()
  await handler(stReq(5), res)
  assert.equal(res.statusCode, 401)
  assert.equal(calls.find, 0)
})
test('status: method selain GET → 405; id tidak valid → 400', async () => {
  const { handler } = statusSetup()
  let res = mockRes(); await handler(stReq(5, 'POST'), res); assert.equal(res.statusCode, 405)
  for (const id of ['abc', 0, -1, 1.5, '']) { res = mockRes(); await handler(stReq(id), res); assert.equal(res.statusCode, 400, `id=${id}`) }
})
test('status: bukan milik user / tidak ada → 404, dicari dengan user id sesi', async () => {
  const { handler, calls } = statusSetup({ topup: null }); const res = mockRes()
  await handler(stReq(5), res)
  assert.equal(res.statusCode, 404)
  assert.deepEqual(calls.last, { id: 5, uid: 'u1' })
})
test('status: approved → paid true', async () => {
  const { handler } = statusSetup({ result: { status: 'approved' } }); const res = mockRes()
  await handler(stReq(5), res)
  assert.deepEqual(res.body, { id: 5, status: 'approved', paid: true })
})
test('status: throttle — pending dipakai ulang dalam TTL, lalu cek lagi setelah TTL', async () => {
  let t = 1_000_000
  const { handler, calls } = statusSetup({ clock: () => t })
  for (let i = 0; i < 3; i++) { const res = mockRes(); await handler(stReq(5), res); assert.equal(res.body.status, 'pending') }
  assert.equal(calls.sync, 1, 'tiga request cepat → satu kali ke gateway')
  t += 3001
  await handler(stReq(5), mockRes())
  assert.equal(calls.sync, 2)
})
test('status: throttle terpisah per user dan per top up', async () => {
  let t = 1
  const calls = { sync: 0 }
  const make = uid => createStatusHandler({ requireUser: okUser(uid), findOwned: async id => ({ id, status: 'pending' }), syncTopup: async () => { calls.sync++; return { status: 'pending' } }, log: logs(), now: () => t })
  await make('a')(stReq(1), mockRes()); await make('a')(stReq(2), mockRes()); await make('b')(stReq(1), mockRes())
  assert.equal(calls.sync, 3)
})
test('status: status final tidak di-cache (perubahan langsung terlihat)', async () => {
  let t = 1; let state = 'pending'
  const { handler, calls } = statusSetup({ clock: () => t, result: () => ({ status: state }) })
  let res = mockRes(); await handler(stReq(5), res); assert.equal(res.body.paid, false)
  t += 3001; state = 'approved'
  res = mockRes(); await handler(stReq(5), res); assert.equal(res.body.paid, true)
  t += 1
  res = mockRes(); await handler(stReq(5), res); assert.equal(res.body.paid, true)
  assert.equal(calls.sync, 3)
})
test('status: error sync → 502 dan tidak di-cache', async () => {
  let fail = true
  const { handler, calls } = statusSetup({ result: () => { if (fail) throw new Error('gateway down'); return { status: 'pending' } } })
  let res = mockRes(); await handler(stReq(5), res); assert.equal(res.statusCode, 502)
  fail = false
  res = mockRes(); await handler(stReq(5), res); assert.equal(res.statusCode, 200)
  assert.equal(calls.sync, 2)
})

// ── Cancel ──────────────────────────────────────────────────────────────────
function cancelSetup({ topup = { id: 9, status: 'pending', btz_transaction_id: 'TX999999' }, syncs = [{ status: 'pending' }], cancel, markThrows } = {}) {
  const calls = { cancel: 0, marked: [], sync: 0 }
  const handler = createCancelHandler({
    requireUser: okUser(),
    findOwned: async () => topup,
    syncTopup: async () => { const r = syncs[Math.min(calls.sync, syncs.length - 1)]; calls.sync++; return r },
    cancelTransaction: async txId => { calls.cancel++; calls.cancelledTx = txId; return cancel ? cancel() : { status: 'cancel' } },
    markCancelled: async id => { if (markThrows) throw new Error('db down'); calls.marked.push(id) },
    log: logs(),
  })
  return { handler, calls }
}
const cnReq = (id = 9, method = 'POST') => ({ method, body: { id } })

test('cancel: validasi method & id', async () => {
  const { handler } = cancelSetup()
  let res = mockRes(); await handler(cnReq(9, 'GET'), res); assert.equal(res.statusCode, 405)
  for (const id of ['x', 0, 2.5, null]) { res = mockRes(); await handler(cnReq(id), res); assert.equal(res.statusCode, 400, `id=${id}`) }
})
test('cancel: tidak ditemukan → 404', async () => {
  const { handler } = cancelSetup({ topup: null }); const res = mockRes()
  await handler(cnReq(), res)
  assert.equal(res.statusCode, 404)
})
test('cancel: ternyata sudah dibayar → tidak membatalkan di gateway', async () => {
  const { handler, calls } = cancelSetup({ syncs: [{ status: 'approved' }] }); const res = mockRes()
  await handler(cnReq(), res)
  assert.deepEqual(res.body, { id: 9, status: 'approved', cancelled: false })
  assert.equal(calls.cancel, 0)
})
test('cancel: pending → dibatalkan di gateway lalu ditandai cancelled', async () => {
  const { handler, calls } = cancelSetup(); const res = mockRes()
  await handler(cnReq(), res)
  assert.deepEqual(res.body, { id: 9, status: 'cancelled', cancelled: true })
  assert.equal(calls.cancelledTx, 'TX999999')
  assert.deepEqual(calls.marked, [9])
})
test('cancel: gateway gagal membatalkan tapi ternyata terbayar → lapor approved', async () => {
  const { handler } = cancelSetup({ syncs: [{ status: 'pending' }, { status: 'approved' }], cancel: () => { throw new Error('sudah dibayar') } }); const res = mockRes()
  await handler(cnReq(), res)
  assert.deepEqual(res.body, { id: 9, status: 'approved', cancelled: false })
})
test('cancel: gateway gagal & masih pending → 409', async () => {
  const { handler, calls } = cancelSetup({ cancel: () => { throw new Error('timeout') } }); const res = mockRes()
  await handler(cnReq(), res)
  assert.equal(res.statusCode, 409)
  assert.deepEqual(calls.marked, [])
})
test('cancel: gateway membalas status selain cancel → 409, tidak ditandai', async () => {
  const { handler, calls } = cancelSetup({ cancel: () => ({ status: 'sukses' }) }); const res = mockRes()
  await handler(cnReq(), res)
  assert.equal(res.statusCode, 409)
  assert.deepEqual(calls.marked, [])
})
test('cancel: update DB gagal setelah gateway batal → tetap sukses (disinkronkan lagi nanti)', async () => {
  const { handler } = cancelSetup({ markThrows: true }); const res = mockRes()
  await handler(cnReq(), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.cancelled, true)
})
test('cancel: error tak terduga → 502', async () => {
  const handler = createCancelHandler({ requireUser: okUser(), findOwned: async () => { throw new Error('db') }, syncTopup: async () => ({}), cancelTransaction: async () => ({}), markCancelled: async () => {}, log: logs() })
  const res = mockRes(); await handler(cnReq(), res)
  assert.equal(res.statusCode, 502)
})

// ── Utilitas ────────────────────────────────────────────────────────────────
test('createTtlCache: kedaluwarsa setelah TTL dan dibatasi ukurannya', () => {
  let t = 0
  const c = createTtlCache(1000, { now: () => t, max: 2 })
  c.set('a', 1); assert.equal(c.get('a'), 1)
  t = 999; assert.equal(c.get('a'), 1)
  t = 1000; assert.equal(c.get('a'), undefined)
  c.set('x', 1); c.set('y', 2); c.set('z', 3)
  assert.equal(c.get('x'), undefined, 'entri tertua dibuang saat penuh')
  assert.equal(c.get('z'), 3)
})
test('passwordError: minimal 8 karakter', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8)
  assert.match(passwordError('1234567'), /minimal 8/)
  assert.equal(passwordError('12345678'), null)
  assert.ok(passwordError(undefined))
  assert.ok(passwordError(12345678))
})
