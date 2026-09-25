// Klien Supabase dengan service_role key — HANYA dipakai di sini (serverless, sisi server).
// service_role melewati Row Level Security sepenuhnya, jadi kunci ini TIDAK BOLEH pernah
// diberi prefix VITE_ (yang akan ikut ter-bundle ke browser).
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY atau VITE_SUPABASE_URL belum diset di environment Vercel.')
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
