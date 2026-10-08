import test from 'node:test'
import assert from 'node:assert/strict'
import { pollDelay, POLL_STEPS_MS } from './polling.ts'

test('pollDelay: mulai 5 dtk, naik bertahap, berhenti di 30 dtk', () => {
  assert.equal(pollDelay(0), 5000)
  assert.equal(pollDelay(2), 10000)
  assert.equal(pollDelay(POLL_STEPS_MS.length - 1), 30000)
  assert.equal(pollDelay(1000), 30000)
})
test('pollDelay: tidak pernah menurun dan aman untuk input aneh', () => {
  for (let i = 1; i < 20; i++) assert.ok(pollDelay(i) >= pollDelay(i - 1))
  assert.equal(pollDelay(-3), 5000)
  assert.equal(pollDelay(1.9), 5000)
})
