import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const INTERVAL_MS = 5000
const DELAY_MS = 1500
const OTP_MAX_AGE_MS = 10 * 60 * 1000 // OTP lebih tua dari ini sudah kedaluwarsa, jangan dikirim
const SCRUBBED = '[kode dihapus]'
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function startOutbox(sock) {
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      // Kode OTP didahulukan supaya tidak antre di belakang notifikasi lain.
      const otp = await supabase.from('wa_outbox').select('*').eq('status', 'pending').eq('kind', 'otp').order('id').limit(10)
      if (otp.error) throw otp.error
      const rest = await supabase.from('wa_outbox').select('*').eq('status', 'pending').or('kind.is.null,kind.neq.otp').order('id').limit(20)
      if (rest.error) throw rest.error
      for (const row of [...(otp.data ?? []), ...(rest.data ?? [])]) {
        const isOtp = row.kind === 'otp'
        if (isOtp && Date.now() - new Date(row.created_at).getTime() > OTP_MAX_AGE_MS) {
          await supabase.from('wa_outbox').update({ status: 'failed', error: 'otp kedaluwarsa', message: SCRUBBED }).eq('id', row.id)
          continue
        }
        try {
          await sock.sendMessage(`${row.phone}@s.whatsapp.net`, { text: row.message })
          // Kode OTP tidak disimpan terus-menerus di tabel setelah terkirim.
          await supabase.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), ...(isOtp ? { message: SCRUBBED } : {}) }).eq('id', row.id)
        } catch (e) {
          await supabase.from('wa_outbox').update({ status: 'failed', error: String(e?.message ?? e).slice(0, 300), ...(isOtp ? { message: SCRUBBED } : {}) }).eq('id', row.id)
        }
        await sleep(DELAY_MS)
      }
    } catch (e) {
      console.error('wa-outbox:', e?.message ?? e)
    } finally {
      busy = false
    }
  }
  return setInterval(tick, INTERVAL_MS)
}
