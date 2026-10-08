// Bot WhatsApp TUYYI STORE (Baileys) — sederhana.
// Tugasnya: tersambung ke WhatsApp, mengirim antrean wa_outbox (OTP/notifikasi, lihat wa-outbox.mjs),
// dan menyinkronkan status ke tabel `wa_bot` supaya bisa dikontrol dari Admin → Bot WA.
//
// Jalankan dari folder bot/:  npm install && npm start     (Node 20.6+)
import { createClient } from '@supabase/supabase-js'
import makeWASocket, { useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import pino from 'pino'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { startOutbox } from './wa-outbox.mjs'

const URL_ = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset (lihat bot/.env.example).'); process.exit(1) }

const AUTH_DIR = process.env.WA_AUTH_DIR || fileURLToPath(new URL('./auth', import.meta.url))
const POLL_MS = 2000
const HEARTBEAT_MS = 15000

const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const logger = pino({ level: 'silent' })
const errMsg = e => String(e?.message ?? e).slice(0, 300)

let sock = null
let outboxTimer = null // antrean wa_outbox: satu interval untuk seluruh umur proses (lihat wa-outbox.mjs)
let gen = 0 // nomor generasi socket; event dari socket lama diabaikan
let reconnectTimer = null
let state = { status: 'offline', phone: null }

/** Tulis status ke tabel wa_bot (juga berfungsi sebagai heartbeat). */
async function publish(patch = {}) {
  state = { ...state, ...patch }
  const now = new Date().toISOString()
  const { error } = await db.from('wa_bot').update({ ...patch, heartbeat_at: now, updated_at: now }).eq('id', 1)
  if (error) console.error('wa_bot:', error.message)
}

const wipeAuth = () => rm(AUTH_DIR, { recursive: true, force: true })

function stopSocket() {
  gen++
  clearTimeout(reconnectTimer)
  if (sock) {
    try { sock.ev.removeAllListeners('connection.update'); sock.ev.removeAllListeners('creds.update'); sock.end(undefined) } catch {}
    sock = null
  }
}

/** mode: 'qr' | 'pair' (pair butuh `phone` format 62xxx). Jika sesi tersimpan sudah tertaut, mode diabaikan. */
async function start(mode, phone) {
  stopSocket()
  const myGen = gen
  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  if (myGen !== gen) return
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}))
  if (myGen !== gen) return

  const s = makeWASocket({ auth, version, logger, browser: Browsers.ubuntu('Chrome'), markOnlineOnConnect: false, syncFullHistory: false })
  sock = s
  let pairAsked = false

  s.ev.on('creds.update', saveCreds)
  s.ev.on('connection.update', async u => {
    if (myGen !== gen) return
    const { connection, lastDisconnect, qr } = u

    if (qr) { // muncul hanya bila belum tertaut
      if (mode === 'pair') {
        if (pairAsked) return
        pairAsked = true
        try {
          const raw = await s.requestPairingCode(phone)
          if (myGen !== gen) return
          await publish({ status: 'pairing', pairing_code: raw.match(/.{1,4}/g)?.join('-') ?? raw, qr: null, last_error: null })
        } catch (e) {
          stopSocket()
          await publish({ status: 'offline', qr: null, pairing_code: null, last_error: 'Gagal meminta kode pairing: ' + errMsg(e) })
        }
      } else {
        try {
          await publish({ status: 'qr', qr: await QRCode.toDataURL(qr, { margin: 1, width: 320 }), pairing_code: null, last_error: null })
        } catch (e) { console.error('qr:', errMsg(e)) }
      }
    }

    if (connection === 'open') {
      const number = (s.user?.id ?? '').split(':')[0].split('@')[0]
      console.log('Tersambung sebagai', number)
      await publish({ status: 'connected', phone: number || null, qr: null, pairing_code: null, last_error: null })
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      if (code === DisconnectReason.restartRequired) { // normal setelah QR dipindai / kode dimasukkan
        start('qr').catch(e => publish({ status: 'offline', last_error: errMsg(e) }))
        return
      }
      if (code === DisconnectReason.loggedOut) { // perangkat dikeluarkan dari ponsel
        stopSocket(); await wipeAuth()
        await publish({ status: 'logged_out', phone: null, qr: null, pairing_code: null, last_error: 'Perangkat dikeluarkan dari WhatsApp. Sambungkan ulang.' })
        return
      }
      if (!auth.creds.me) { // QR / kode kedaluwarsa sebelum ada yang menautkan
        stopSocket()
        await publish({ status: 'offline', qr: null, pairing_code: null, last_error: 'Waktu habis sebelum tertaut. Klik Sambungkan untuk mencoba lagi.' })
        return
      }
      // Putus sementara: sambung ulang otomatis. Antrean tetap berjalan (OTP bisa lewat jalur cadangan bila ada).
      await publish({ status: 'connecting', qr: null, pairing_code: null, last_error: `Terputus (${code ?? '?'}), menyambung ulang…` })
      reconnectTimer = setTimeout(() => start('qr').catch(e => publish({ status: 'offline', last_error: errMsg(e) })), 3000)
    }
  })
}

async function run(c) {
  if (c.action === 'connect_qr' || c.action === 'connect_pair') {
    if (state.status === 'connected') throw new Error('Bot sudah terhubung. Putuskan dulu sebelum menyambungkan nomor lain.')
    stopSocket(); await wipeAuth()
    await start(c.action === 'connect_pair' ? 'pair' : 'qr', c.phone)
  } else if (c.action === 'logout') {
    try { await sock?.logout() } catch {}
    stopSocket(); await wipeAuth()
    await publish({ status: 'offline', phone: null, qr: null, pairing_code: null, last_error: null })
  } else if (c.action === 'restart') {
    const { state: auth } = await useMultiFileAuthState(AUTH_DIR)
    if (!auth.creds.me) throw new Error('Belum ada sesi tersimpan. Sambungkan dulu lewat QR atau kode pairing.')
    await publish({ status: 'connecting', qr: null, pairing_code: null, last_error: null })
    await start('qr')
  }
}

let polling = false
async function pollCommands() {
  if (polling) return
  polling = true
  try {
    const { data, error } = await db.from('wa_bot_commands').select('*').eq('status', 'pending').order('id').limit(5)
    if (error) throw error
    for (const c of data ?? []) {
      // Klaim dulu supaya tidak diproses dua kali.
      const claim = await db.from('wa_bot_commands').update({ status: 'done', done_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'pending').select('id')
      if (!claim.data?.length) continue
      try { await run(c) } catch (e) {
        console.error('perintah', c.action, '→', errMsg(e))
        await db.from('wa_bot_commands').update({ status: 'failed', error: errMsg(e) }).eq('id', c.id)
        await publish({ status: state.status, last_error: errMsg(e) }) // kembalikan status sebenarnya ke UI
      }
    }
  } catch (e) { console.error('commands:', errMsg(e)) } finally { polling = false }
}

async function main() {
  // Perintah basi (dibuat saat bot mati) tidak dijalankan.
  await db.from('wa_bot_commands').update({ status: 'failed', error: 'kedaluwarsa' }).eq('status', 'pending').lt('created_at', new Date(Date.now() - 120000).toISOString())

  const { state: auth } = await useMultiFileAuthState(AUTH_DIR)
  if (auth.creds.me) {
    await publish({ status: 'connecting', qr: null, pairing_code: null, last_error: null })
    await start('qr')
  } else {
    await publish({ status: 'offline', phone: null, qr: null, pairing_code: null })
    console.log('Belum ada sesi. Sambungkan dari Admin → Bot WA.')
  }
  outboxTimer = startOutbox({ getSock: () => (state.status === 'connected' ? sock : null) })
  setInterval(pollCommands, POLL_MS)
  setInterval(() => publish({}), HEARTBEAT_MS)
}

const shutdown = async () => { clearInterval(outboxTimer); try { await publish({ status: 'offline' }) } catch {} process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('unhandledRejection', e => console.error('unhandledRejection:', errMsg(e)))

main().catch(e => { console.error(e); process.exit(1) })
