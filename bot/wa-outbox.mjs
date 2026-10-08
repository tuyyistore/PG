// Penghubung antrean wa_outbox ↔ Supabase (service_role). Logika pengiriman ada di outbox-core.mjs (bisa dites).
import { createClient } from '@supabase/supabase-js'
import { createOutbox, SCRUBBED } from './outbox-core.mjs'
import { cloudConfigFromEnv, createCloudSender } from './wa-cloud.mjs'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const db = {
  async fetchPending() {
    const otp = await supabase.from('wa_outbox').select('*').eq('status', 'pending').eq('kind', 'otp').order('id').limit(10)
    if (otp.error) throw otp.error
    const rest = await supabase.from('wa_outbox').select('*').eq('status', 'pending').or('kind.is.null,kind.neq.otp').order('id').limit(20)
    if (rest.error) throw rest.error
    return { otp: otp.data ?? [], rest: rest.data ?? [] }
  },
  async markSent(id, { scrub }) {
    await supabase.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), ...(scrub ? { message: SCRUBBED } : {}) }).eq('id', id)
  },
  async markFailed(id, error, { scrub }) {
    await supabase.from('wa_outbox').update({ status: 'failed', error, ...(scrub ? { message: SCRUBBED } : {}) }).eq('id', id)
  },
}

/**
 * Jalankan antrean. Berjalan terus selama proses hidup (bukan per soket), sehingga OTP kedaluwarsa tetap
 * dibersihkan saat Baileys mati dan jalur cadangan Cloud API (bila dikonfigurasi) bisa mengambil alih untuk OTP.
 * @param {{ getSock: () => (object|null) }} opts getSock → soket Baileys yang sedang tersambung, atau null.
 */
export function startOutbox({ getSock }) {
  const cfg = cloudConfigFromEnv()
  const cloud = cfg ? createCloudSender(cfg) : null
  console.log(cloud ? 'Cadangan OTP via WhatsApp Cloud API: AKTIF' : 'Cadangan OTP via WhatsApp Cloud API: nonaktif (WA_CLOUD_* belum diisi)')
  return createOutbox({ db, getSock, cloud }).start()
}
