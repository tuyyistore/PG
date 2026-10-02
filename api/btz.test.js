import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapGatewayStatus, extractTransactionId, evaluateTransaction, safeEqual, sanitizeTx, safePaymentUrl, topupRef } from './_btzLogic.js'
import { createSyncer } from './_btzSync.js'

const base = (o = {}) => ({ id: 7, amount: 10000, status: 'pending', gateway: 'betabotz', btz_transaction_id: 'TRX123456', btz_access_key: 'k', ...o })
const tx = (o = {}) => ({ transactionId: 'TRX123456', amount: 10000, totalAmount: 10574, status: 'sukses', paidAt: '2026-01-16T08:46:52.572Z', metadata: { orderId: topupRef(7) }, ...o })

test('mapGatewayStatus: status resmi Betabotz', () => {
  assert.equal(mapGatewayStatus('sukses'), 'approved')
  assert.equal(mapGatewayStatus('SUKSES '), 'approved')
  assert.equal(mapGatewayStatus('pending'), 'pending')
  assert.equal(mapGatewayStatus('expired'), 'expired')
  assert.equal(mapGatewayStatus('cancel'), 'cancelled')
  assert.equal(mapGatewayStatus('gagal'), 'rejected')
  assert.equal(mapGatewayStatus('success'), null) // tidak ada di dokumentasi → tidak dianggap sukses
  assert.equal(mapGatewayStatus(undefined), null)
})

test('extractTransactionId dari format callback resmi', () => {
  assert.equal(extractTransactionId({ pay_id: 'TRX17685536101913729', status: 'sukses' }), 'TRX17685536101913729')
  assert.equal(extractTransactionId({ raw: { data: { transactionId: 'TRX999999' } } }), 'TRX999999')
  assert.equal(extractTransactionId({ pay_id: '../etc' }), null)
  assert.equal(extractTransactionId(null), null)
  assert.equal(extractTransactionId({ pay_id: 12345678 }), null)
})

test('evaluateTransaction: kredit hanya bila sukses + id + order + nominal cocok', () => {
  assert.deepEqual(evaluateTransaction(base(), tx()), { action: 'credit' })
  assert.equal(evaluateTransaction(base({ status: 'expired' }), tx()).action, 'credit') // bayar telat sebelum kedaluwarsa Betabotz
  assert.equal(evaluateTransaction(base(), tx({ amount: 1000 })).reason, 'amount')
  assert.equal(evaluateTransaction(base(), tx({ amount: undefined })).reason, 'amount')
  assert.equal(evaluateTransaction(base(), tx({ transactionId: 'TRXOTHER1' })).reason, 'transaction_id')
  assert.equal(evaluateTransaction(base(), tx({ metadata: { orderId: 'TOPUP-8' } })).reason, 'order_ref')
  assert.equal(evaluateTransaction(base({ status: 'approved' }), tx()).action, 'none')
  assert.equal(evaluateTransaction(base({ status: 'cancelled' }), tx()).action, 'none')
})

test('evaluateTransaction: status non-sukses tidak pernah kredit', () => {
  assert.deepEqual(evaluateTransaction(base(), tx({ status: 'expired' })), { action: 'mark', status: 'expired' })
  assert.deepEqual(evaluateTransaction(base(), tx({ status: 'cancel' })), { action: 'mark', status: 'cancelled' })
  assert.deepEqual(evaluateTransaction(base(), tx({ status: 'gagal' })), { action: 'mark', status: 'rejected' })
  assert.equal(evaluateTransaction(base(), tx({ status: 'pending' })).action, 'none')
  assert.equal(evaluateTransaction(base(), tx({ status: 'aneh' })).action, 'none')
})

test('safeEqual, sanitizeTx, safePaymentUrl', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('', ''), false)
  assert.equal(safeEqual(undefined, 'x'), false)
  assert.deepEqual(sanitizeTx({ transactionId: 'T', accessKey: 'secret', apikey: 'x', amount: 1 }), { transactionId: 'T', amount: 1 })
  const B = 'https://web.btzpay.my.id'
  assert.ok(safePaymentUrl('https://web.btzpay.my.id/transaction/TRX1?key=a', B))
  assert.equal(safePaymentUrl('https://evil.example/transaction/TRX1', B), null)
  assert.equal(safePaymentUrl('http://web.btzpay.my.id/x', B), null)
  assert.equal(safePaymentUrl('javascript:alert(1)', B), null)
})

// ── Syncer + DB tiruan yang meniru atomisitas settle_gateway_topup (UPDATE bersyarat status) ──
function fakeEnv({ topupStatus = 'pending', gwTx = tx() } = {}) {
  const state = { status: topupStatus, saldo: 0, gatewayCalls: 0, logs: [] }
  const db = {
    async settle({ paidAmount }) {
      await new Promise(r => setImmediate(r)) // beri kesempatan balapan antar pemanggil
      if ((state.status === 'pending' || state.status === 'expired') && paidAmount === 10000) { state.status = 'approved'; state.saldo += 10000; return { credited: true, status: 'approved' } }
      return { credited: false, status: state.status }
    },
    async markTerminal({ status }) { if (state.status !== 'pending') return false; state.status = status; return true },
  }
  const getTransaction = async () => { state.gatewayCalls++; return gwTx }
  const syncTopup = createSyncer({ getTransaction, db, log: (...a) => state.logs.push(a) })
  return { state, syncTopup }
}

test('idempotensi: callback + polling bersamaan hanya menambah saldo sekali', async () => {
  const { state, syncTopup } = fakeEnv()
  const snapshot = base() // semua pemanggil melihat snapshot "pending"
  const results = await Promise.all(Array.from({ length: 6 }, () => syncTopup({ ...snapshot })))
  assert.equal(state.saldo, 10000)
  assert.equal(results.filter(r => r.changed).length, 1)
  assert.ok(results.every(r => r.status === 'approved'))
})

test('callback ulang setelah approved tidak menghubungi gateway dan tidak mengubah saldo', async () => {
  const { state, syncTopup } = fakeEnv({ topupStatus: 'approved' })
  const r = await syncTopup(base({ status: 'approved' }))
  assert.equal(r.changed, false)
  assert.equal(state.gatewayCalls, 0)
  assert.equal(state.saldo, 0)
})

test('expired/cancel/gagal di gateway → tidak ada saldo, status final tercatat', async () => {
  for (const [gw, local] of [['expired', 'expired'], ['cancel', 'cancelled'], ['gagal', 'rejected']]) {
    const { state, syncTopup } = fakeEnv({ gwTx: tx({ status: gw }) })
    const r = await syncTopup(base())
    assert.equal(state.saldo, 0)
    assert.equal(state.status, local)
    assert.equal(r.status, local)
  }
})

test('nominal/id tidak cocok → ditolak, saldo tidak berubah, tercatat error', async () => {
  const { state, syncTopup } = fakeEnv({ gwTx: tx({ amount: 500 }) })
  const r = await syncTopup(base())
  assert.equal(r.mismatch, true)
  assert.equal(state.saldo, 0)
  assert.ok(state.logs.some(l => l[0] === 'error' && l[1] === 'tx_mismatch'))
})

test('error gateway dilempar ke pemanggil (callback → 502 agar bisa diulang)', async () => {
  const syncTopup = createSyncer({ getTransaction: async () => { throw new Error('timeout') }, db: {}, log: () => {} })
  await assert.rejects(() => syncTopup(base()), /timeout/)
})

test('top up non-gateway / tanpa transactionId diabaikan', async () => {
  const { state, syncTopup } = fakeEnv()
  assert.equal((await syncTopup(base({ gateway: null }))).changed, false)
  assert.equal((await syncTopup(base({ btz_transaction_id: null }))).changed, false)
  assert.equal(state.gatewayCalls, 0)
})
