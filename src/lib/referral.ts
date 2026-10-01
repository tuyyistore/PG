import { api } from './supabase'

const KEY = 'wt-ref'

export function captureReferral() {
  try {
    const code = new URLSearchParams(location.search).get('ref')
    if (code && /^USR-[A-Z0-9]{4,16}$/i.test(code)) localStorage.setItem(KEY, code.toUpperCase())
  } catch {}
}

export async function applyStoredReferral() {
  let code: string | null = null
  try { code = localStorage.getItem(KEY) } catch {}
  if (!code) return
  try { await api('rpc/apply_referral', { method: 'POST', body: { p_code: code } }) } catch {}
  try { localStorage.removeItem(KEY) } catch {}
}
