import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const INTERVAL_MS = 5000
const DELAY_MS = 1500
const sleep = ms => new Promise(r => setTimeout(r, ms))

export function startOutbox(sock) {
  let busy = false
  const tick = async () => {
    if (busy) return
    busy = true
    try {
      const { data, error } = await supabase.from('wa_outbox').select('*').eq('status', 'pending').order('id').limit(20)
      if (error) throw error
      for (const row of data ?? []) {
        try {
          await sock.sendMessage(`${row.phone}@s.whatsapp.net`, { text: row.message })
          await supabase.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id)
        } catch (e) {
          await supabase.from('wa_outbox').update({ status: 'failed', error: String(e?.message ?? e).slice(0, 300) }).eq('id', row.id)
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
