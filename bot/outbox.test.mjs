// Tes inti antrean WA + jalur cadangan OTP (tanpa Supabase/Baileys/jaringan).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createOutbox, OTP_MAX_AGE_MS, SCRUBBED } from './outbox-core.mjs'

const T0 = Date.parse('2026-10-08T10:00:00Z')
const fresh = (over = {}) => ({ id: 1, phone: '6281234567890', message: 'Halo', kind: 'info', created_at: new Date(T0 - 1000).toISOString(), ...over })
const otpRow = (over = {}) => fresh({ message: 'Kode verifikasi Tuyyi Store: 123456. Berlaku 5 menit.', kind: 'otp', ...over })

function setup({ rows = [], sock = undefined, cloud = null, sendImpl } = {}) {
  const events = []
  const db = {
    async fetchPending() { return { otp: rows.filter(r => r.kind === 'otp'), rest: rows.filter(r => r.kind !== 'otp') } },
    async markSent(id, o) { events.push(['sent', id, o.scrub]) },
    async markFailed(id, error, o) { events.push(['failed', id, error, o.scrub]) },
  }
  const sent = []
  const fakeSock = sock === null ? null : { sendMessage: async (jid, content) => { if (sendImpl) await sendImpl(jid, content); sent.push([jid, content.text]) } }
  const outbox = createOutbox({ db, getSock: () => fakeSock, cloud, now: () => T0, sleep: async () => {}, log: { log() {}, error() {} } })
  return { outbox, events, sent }
}
const cloudStub = (impl) => { const calls = []; return { calls, async sendOtp(row) { calls.push(row.id); if (impl) await impl(row) } } }

test('Baileys tersambung: OTP didahulukan, OTP dihapus kodenya setelah terkirim, pesan lain tidak', async () => {
  const { outbox, events, sent } = setup({ rows: [fresh({ id: 1 }), otpRow({ id: 2 })] })
  await outbox.tick()
  assert.deepEqual(events, [['sent', 2, true], ['sent', 1, false]])
  assert.deepEqual(sent.map(s => s[0]), ['6281234567890@s.whatsapp.net', '6281234567890@s.whatsapp.net'])
  assert.match(sent[0][1], /123456/)
})

test('OTP kedaluwarsa → gagal + kode dihapus, bahkan saat bot offline', async () => {
  const old = otpRow({ id: 5, created_at: new Date(T0 - OTP_MAX_AGE_MS - 1).toISOString() })
  const { outbox, events, sent } = setup({ rows: [old], sock: null })
  await outbox.tick()
  assert.deepEqual(events, [['failed', 5, 'otp kedaluwarsa', true]])
  assert.equal(sent.length, 0)
})

test('offline tanpa cloud: baris yang belum kedaluwarsa dibiarkan pending', async () => {
  const { outbox, events } = setup({ rows: [fresh({ id: 1 }), otpRow({ id: 2 })], sock: null })
  await outbox.tick()
  assert.deepEqual(events, [])
})

test('offline + cloud: hanya OTP lewat cloud; pesan lain tetap menunggu Baileys', async () => {
  const cloud = cloudStub()
  const { outbox, events } = setup({ rows: [fresh({ id: 1 }), otpRow({ id: 2 })], sock: null, cloud })
  await outbox.tick()
  assert.deepEqual(cloud.calls, [2])
  assert.deepEqual(events, [['sent', 2, true]])
})

test('Baileys gagal kirim OTP + cloud tersedia → cadangan dipakai', async () => {
  const cloud = cloudStub()
  const { outbox, events } = setup({ rows: [otpRow({ id: 3 })], cloud, sendImpl: async () => { throw new Error('Connection Closed') } })
  await outbox.tick()
  assert.deepEqual(cloud.calls, [3])
  assert.deepEqual(events, [['sent', 3, true]])
})

test('Baileys gagal kirim OTP tanpa cloud → failed + kode dihapus', async () => {
  const { outbox, events } = setup({ rows: [otpRow({ id: 3 })], sendImpl: async () => { throw new Error('Connection Closed') } })
  await outbox.tick()
  assert.deepEqual(events, [['failed', 3, 'Connection Closed', true]])
})

test('Baileys gagal kirim pesan biasa → failed, cloud TIDAK dipakai', async () => {
  const cloud = cloudStub()
  const { outbox, events } = setup({ rows: [fresh({ id: 4 })], cloud, sendImpl: async () => { throw new Error('boom') } })
  await outbox.tick()
  assert.deepEqual(cloud.calls, [])
  assert.deepEqual(events, [['failed', 4, 'boom', false]])
})

test('baileys dan cloud sama-sama gagal → error gabungan, tanpa kode OTP, kode dihapus', async () => {
  const cloud = cloudStub(async () => { throw new Error('Cloud API HTTP 401') })
  const { outbox, events } = setup({ rows: [otpRow({ id: 6 })], cloud, sendImpl: async () => { throw new Error('Connection Closed') } })
  await outbox.tick()
  const [kind, id, error, scrub] = events[0]
  assert.deepEqual([kind, id, scrub], ['failed', 6, true])
  assert.match(error, /baileys: Connection Closed; cloud: Cloud API HTTP 401/)
  assert.ok(!error.includes('123456'))
})

test('cloud gagal saat offline → failed + kode dihapus', async () => {
  const cloud = cloudStub(async () => { throw new Error('Cloud API HTTP 400') })
  const { outbox, events } = setup({ rows: [otpRow({ id: 7 })], sock: null, cloud })
  await outbox.tick()
  assert.deepEqual(events, [['failed', 7, 'Cloud API HTTP 400', true]])
})

test('soket putus di tengah antrean tanpa cadangan: sisa baris tetap pending, tidak ditandai gagal', async () => {
  let live = true
  const events = []
  const rows = [fresh({ id: 1 }), fresh({ id: 2 }), fresh({ id: 3 })]
  const db = { fetchPending: async () => ({ otp: [], rest: rows }), markSent: async id => { events.push(['sent', id]) }, markFailed: async id => { events.push(['failed', id]) } }
  const outbox = createOutbox({ db, getSock: () => (live ? { sendMessage: async () => {} } : null), now: () => T0, sleep: async () => { live = false }, log: { log() {}, error() {} } })
  await outbox.tick()
  assert.deepEqual(events, [['sent', 1]])
})

test('tick bersamaan tidak mengirim ganda', async () => {
  let release
  const gate = new Promise(r => { release = r })
  const { outbox, events, sent } = setup({ rows: [fresh({ id: 1 })], sendImpl: () => gate })
  const a = outbox.tick(); const b = outbox.tick()
  await b
  release(); await a
  assert.equal(sent.length, 1)
  assert.deepEqual(events, [['sent', 1, false]])
})

test('pesan error dipotong 300 karakter', async () => {
  const { outbox, events } = setup({ rows: [fresh({ id: 1 })], sendImpl: async () => { throw new Error('x'.repeat(1000)) } })
  await outbox.tick()
  assert.equal(events[0][2].length, 300)
})

test('error pengambilan antrean tidak menjatuhkan proses dan tick berikutnya tetap jalan', async () => {
  let fail = true
  const logged = []
  const db = { fetchPending: async () => { if (fail) throw new Error('db down'); return { otp: [], rest: [] } }, markSent() {}, markFailed() {} }
  const outbox = createOutbox({ db, getSock: () => null, now: () => T0, sleep: async () => {}, log: { log() {}, error: (...a) => logged.push(a.join(' ')) } })
  await outbox.tick()
  assert.match(logged[0], /db down/)
  fail = false
  await outbox.tick()
  assert.equal(SCRUBBED, '[kode dihapus]')
})
