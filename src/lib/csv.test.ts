import { test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, ilikeOr } from './csv.ts'

test('csvCell menetralkan awalan formula', () => {
  for (const v of ['=1+1', '+62812', '-5', '@SUM(A1)', '\tx', '\rx']) assert.equal(csvCell(v), `'${v}`)
})

test('csvCell tidak mengubah teks biasa dan angka', () => {
  assert.equal(csvCell('Budi'), 'Budi')
  assert.equal(csvCell('62812'), '62812')
  assert.equal(csvCell(5000), 5000)
  assert.equal(csvCell(-5), -5)
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(undefined), '')
})

test('ilikeOr kosong bila kata kosong atau hanya spasi', () => {
  assert.equal(ilikeOr(['email'], ''), '')
  assert.equal(ilikeOr(['email'], '   '), '')
})

test('ilikeOr membuang karakter yang bisa merusak filter', () => {
  const q = decodeURIComponent(ilikeOr(['email'], 'a"b\\c*d%e').replace('&or=', ''))
  assert.equal(q, '(email.ilike."*abcde*")')
})

test('ilikeOr aman untuk koma dan kurung (nilai dibungkus kutip)', () => {
  const q = decodeURIComponent(ilikeOr(['a', 'b'], 'x, y)').replace('&or=', ''))
  assert.equal(q, '(a.ilike."*x, y)*",b.ilike."*x, y)*")')
})
