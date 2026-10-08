// Tes perilaku sesi di lib/supabase.ts dengan fetch palsu (tanpa jaringan/browser).
import test from 'node:test'
import assert from 'node:assert/strict'
import { signInWithUsername, api, apiFn } from './supabase.ts'

type Call = { url: string; auth: string | null }
const realFetch = globalThis.fetch
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const tokenBody = (access: string, expiresIn: number) => ({ access_token: access, refresh_token: `r-${access}`, expires_in: expiresIn, user: { id: 'u1' } })

/** Pasang fetch palsu; `refresh` menentukan balasan endpoint refresh. Mengembalikan daftar panggilan. */
function install(refresh: () => Promise<Response> | Response, other: (url: string) => Response = () => json([])): Call[] {
  const calls: Call[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, auth: headers.Authorization ?? null })
    if (url.includes('grant_type=password')) return json(tokenBody('old', 30)) // sudah hampir habis (<60 dtk) → memicu refresh
    if (url.includes('grant_type=refresh_token')) return refresh()
    return other(url)
  }) as typeof fetch
  return calls
}
const refreshCalls = (c: Call[]) => c.filter(x => x.url.includes('grant_type=refresh_token')).length
const login = () => signInWithUsername('tester', 'password-panjang')

test.afterEach(() => { globalThis.fetch = realFetch })

test('refresh: request bersamaan hanya memicu SATU refresh dan semuanya memakai token baru', async () => {
  const calls = install(async () => { await new Promise(r => setTimeout(r, 20)); return json(tokenBody('new', 3600)) })
  await login()
  await Promise.all([api('a'), api('b'), api('c'), apiFn('d', { method: 'POST', body: {} })])
  assert.equal(refreshCalls(calls), 1)
  const used = calls.filter(c => c.url.includes('/rest/v1/') || c.url.startsWith('/api/')).map(c => c.auth)
  assert.equal(used.length, 4)
  assert.ok(used.every(a => a === 'Bearer new'), `semua request harus pakai token baru, dapat: ${used.join(', ')}`)
})

test('refresh: jaringan putus → sesi lama dipertahankan (tidak logout)', async () => {
  const calls = install(() => { throw new TypeError('Failed to fetch') })
  await login()
  await api('a') // refresh gagal karena jaringan, request tetap dikirim dengan token lama
  await api('b')
  assert.equal(calls.filter(c => c.url.includes('/rest/v1/')).every(c => c.auth === 'Bearer old'), true)
  assert.equal(refreshCalls(calls), 2, 'dicoba lagi di request berikutnya, bukan menyerah')
})

test('refresh: server 5xx → sesi dipertahankan', async () => {
  const calls = install(() => json({ msg: 'down' }, 503))
  await login()
  await api('a')
  assert.equal(calls.find(c => c.url.includes('/rest/v1/'))?.auth, 'Bearer old')
})

test('refresh: ditolak server (400) → sesi dihapus', async () => {
  const calls = install(() => json({ error: 'invalid_grant' }, 400))
  await login()
  await api('a')
  await api('b')
  const rest = calls.filter(c => c.url.includes('/rest/v1/'))
  assert.equal(rest.every(c => c.auth !== 'Bearer old'), true, 'token lama tidak dipakai lagi')
  assert.equal(refreshCalls(calls), 1, 'tidak mencoba refresh lagi setelah sesi dihapus')
})

test('apiFn: pesan error rapi untuk JSON, 504 HTML, dan 5xx HTML', async () => {
  install(() => json(tokenBody('new', 3600)), url => {
    if (url.includes('/api/json')) return json({ error: 'Nominal tidak valid' }, 400)
    if (url.includes('/api/timeout')) return new Response('<html>Gateway Timeout</html>', { status: 504 })
    if (url.includes('/api/boom')) return new Response('<html>Bad Gateway</html>', { status: 502 })
    return json({ ok: true })
  })
  await login()
  await assert.rejects(apiFn('json'), { message: 'Nominal tidak valid' })
  await assert.rejects(apiFn('timeout'), { message: /terlalu lama/ })
  await assert.rejects(apiFn('boom'), { message: /bermasalah/ })
  assert.deepEqual(await apiFn('ok'), { ok: true })
})
