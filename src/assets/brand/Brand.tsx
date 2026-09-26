import { displayName, type SessionUser } from '../lib/supabase'
import logo from '../assets/brand/logo.webp'

// ─── Brand ────────────────────────────────────────────────────────────────────

// Ganti nama brand di sini bila perlu.
export const BRAND_NAME = 'TUYYI STORE'

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logo} alt={BRAND_NAME} style={{ width: size, height: size, objectFit: 'contain' }} className="flex-shrink-0" />
      <span className="text-[15px] font-semibold text-white tracking-tight">{BRAND_NAME}</span>
    </div>
  )
}

// ─── Auth UI & mapper data ────────────────────────────────────────────────────

export function Avatar({ user, size }: { user: SessionUser; size: number }) {
  const url = user.user_metadata?.avatar_url || user.user_metadata?.picture
  return url
    ? <img src={url} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }} />
    : <div className="rounded-full flex items-center justify-center font-semibold text-slate-200 flex-shrink-0" style={{ width: size, height: size, background: '#26314b', fontSize: size * 0.4, boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>{displayName(user).charAt(0).toUpperCase()}</div>
}
