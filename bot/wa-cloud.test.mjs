// Tes klien WhatsApp Cloud API (opsional) dengan fetch palsu.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudConfigFromEnv, extractOtpCode, buildOtpPayload, createCloudSender } from './wa-cloud.mjs'

const env = { WA_CLOUD_TOKEN: 'tok-rahasia', WA_CLOUD_PHONE_ID: '1098765', WA_CLOUD_OTP_TEMPLATE: 'tuyyi_otp' }
const MSG = 'Kode verifikasi Tuyyi Store: 482913. Berlaku 5 menit. Jangan bagikan kode ini ke siapa pun.'

test('cloudConfigFromEnv: null bila ada yang kosong, default bila lengkap', () => {
  assert.equal(cloudConfigFromEnv({}), null)
  for (const k of Object.keys(env)) assert.equal(cloudConfigFromEnv({ ...env, [k]: '' }), null, k)
  const c = cloudConfigFromEnv(env)
  assert.deepEqual([c.lang, c.copyButton, c.version], ['id', true, 'v21.0'])
  assert.equal(cloudConfigFromEnv({ ...env, WA_CLOUD_OTP_BUTTON: 'false', WA_CLOUD_OTP_LANG: 'en_US' }).copyButton, false)
})

test('extractOtpCode: tepat satu kode 6 digit', () => {
  assert.equal(extractOtpCode(MSG), '482913')
  assert.equal(extractOtpCode('tanpa kode, berlaku 5 menit'), null)
  assert.equal(extractOtpCode('kode 123456 atau 654321'), null)
  assert.equal(extractOtpCode('nomor 1234567 terlalu panjang'), null)
  assert.equal(extractOtpCode(undefined), null)
})

test('buildOtpPayload: komponen body + tombol salin-kode sesuai format template Authentication', () => {
  const cfg = cloudConfigFromEnv(env)
  const p = buildOtpPayload('6281234567890', '482913', cfg)
  assert.equal(p.messaging_product, 'whatsapp'); assert.equal(p.type, 'template'); assert.equal(p.to, '6281234567890')
  assert.deepEqual(p.template.language, { code: 'id' })
  assert.deepEqual(p.template.components[0], { type: 'body', parameters: [{ type: 'text', text: '482913' }] })
  assert.deepEqual(p.template.components[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] })
  assert.equal(buildOtpPayload('6281234567890', '482913', { ...cfg, copyButton: false }).template.components.length, 1)
})

test('sendOtp: request ke Graph API dengan token Bearer dan payload benar', async () => {
  const seen = {}
  const sender = createCloudSender(cloudConfigFromEnv(env), { fetchImpl: async (url, init) => { Object.assign(seen, { url, init }); return new Response('{"messages":[{"id":"wamid.x"}]}', { status: 200 }) } })
  await sender.sendOtp({ phone: '6281234567890', message: MSG })
  assert.equal(seen.url, 'https://graph.facebook.com/v21.0/1098765/messages')
  assert.equal(seen.init.method, 'POST')
  assert.equal(seen.init.headers.Authorization, 'Bearer tok-rahasia')
  assert.equal(JSON.parse(seen.init.body).template.components[0].parameters[0].text, '482913')
})

test('sendOtp: HTTP error → pesan memuat status & alasan Meta, TANPA token dan kode', async () => {
  const sender = createCloudSender(cloudConfigFromEnv(env), { fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Template tidak ditemukan' } }), { status: 400 }) })
  await assert.rejects(sender.sendOtp({ phone: '6281234567890', message: MSG }), e => {
    assert.match(e.message, /HTTP 400.*Template tidak ditemukan/)
    assert.ok(!e.message.includes('tok-rahasia') && !e.message.includes('482913'))
    return true
  })
})

test('sendOtp: error jaringan tidak membocorkan detail (token/URL) dan non-JSON ditangani', async () => {
  const net = createCloudSender(cloudConfigFromEnv(env), { fetchImpl: async () => { throw new TypeError('fetch failed https://graph...Bearer tok-rahasia') } })
  await assert.rejects(net.sendOtp({ phone: '6281234567890', message: MSG }), e => { assert.ok(!e.message.includes('tok-rahasia')); return true })
  const html = createCloudSender(cloudConfigFromEnv(env), { fetchImpl: async () => new Response('<html>502</html>', { status: 502 }) })
  await assert.rejects(html.sendOtp({ phone: '6281234567890', message: MSG }), { message: 'Cloud API HTTP 502' })
})

test('sendOtp: nomor tidak valid / tanpa kode → ditolak sebelum menghubungi Meta', async () => {
  let called = 0
  const sender = createCloudSender(cloudConfigFromEnv(env), { fetchImpl: async () => { called++; return new Response('{}') } })
  await assert.rejects(sender.sendOtp({ phone: '08123456789', message: MSG }), /nomor tujuan tidak valid/)
  await assert.rejects(sender.sendOtp({ phone: '6281234567890', message: 'tanpa kode' }), /kode OTP/)
  assert.equal(called, 0)
})
