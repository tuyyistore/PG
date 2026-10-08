// Inti antrean wa_outbox — murni (tanpa Supabase/Baileys/jaringan) supaya bisa dites.
// Dependensi diinjeksi: `db` (adapter), `getSock()` (soket Baileys aktif atau null), `cloud` (opsional, hanya OTP).
//
// Aturan pengiriman:
//  • Baileys tersambung → kirim lewat Baileys (semua jenis pesan).
//  • Baileys mati/gagal + `cloud` terkonfigurasi → HANYA baris kind='otp' dikirim lewat WhatsApp Cloud API
//    (pesan lain butuh template bisnis, jadi tetap menunggu Baileys).
//  • Tidak ada jalur → baris dibiarkan pending, KECUALI OTP yang sudah lewat batas usia: ditandai gagal dan
//    kodenya dihapus dari tabel (dulu hanya terjadi saat bot tersambung, sehingga kode bisa menumpuk saat bot mati).
export const OTP_MAX_AGE_MS = 10 * 60 * 1000 // OTP lebih tua dari ini sudah kedaluwarsa, jangan dikirim
export const SCRUBBED = '[kode dihapus]'
const errText = e => String(e?.message ?? e).slice(0, 300)
const defaultSleep = ms => new Promise(r => setTimeout(r, ms))

export function createOutbox({ db, getSock, cloud = null, now = Date.now, sleep = defaultSleep, delayMs = 1500, log = console }) {
  let busy = false

  async function deliver(row, isOtp) {
    const sock = getSock()
    let primaryError = null
    if (sock) {
      try { await sock.sendMessage(`${row.phone}@s.whatsapp.net`, { text: row.message }); return 'baileys' }
      catch (e) { if (!(isOtp && cloud)) throw e; primaryError = e }
    }
    if (isOtp && cloud) {
      try { await cloud.sendOtp(row); log.log?.(`otp #${row.id} terkirim lewat Cloud API${primaryError ? ' (Baileys gagal: ' + errText(primaryError) + ')' : ''}`); return 'cloud' }
      catch (e) { throw primaryError ? new Error(`baileys: ${errText(primaryError)}; cloud: ${errText(e)}`) : e }
    }
    return null // tidak ada jalur
  }

  async function tick() {
    if (busy) return
    busy = true
    try {
      const { otp, rest } = await db.fetchPending()
      for (const row of [...otp, ...rest]) { // OTP didahulukan supaya tidak antre di belakang notifikasi lain
        const isOtp = row.kind === 'otp'
        if (isOtp && now() - new Date(row.created_at).getTime() > OTP_MAX_AGE_MS) {
          await db.markFailed(row.id, 'otp kedaluwarsa', { scrub: true })
          continue
        }
        if (!getSock() && !(isOtp && cloud)) continue // belum ada jalur kirim → tetap pending
        try {
          const via = await deliver(row, isOtp)
          if (via === null) continue // soket putus di tengah antrean, tidak ada cadangan → tetap pending
          await db.markSent(row.id, { scrub: isOtp }) // kode OTP tidak disimpan terus-menerus setelah terkirim
        } catch (e) {
          await db.markFailed(row.id, errText(e), { scrub: isOtp })
        }
        await sleep(delayMs)
      }
    } catch (e) {
      log.error?.('wa-outbox:', e?.message ?? e)
    } finally {
      busy = false
    }
  }

  return { tick, start: (intervalMs = 5000) => setInterval(tick, intervalMs) }
}
