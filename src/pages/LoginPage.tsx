import { useState } from 'react'
import { configured, signInWithGoogle, signInWithGitHub, signInWithUsername, signUpWithUsername, type Session } from '../lib/supabase'
import { Icon } from '../ui'
import { BrandMark } from '../components/Brand'

// ─── Login Page ───────────────────────────────────────────────────────────────
// Tiga cara masuk: Google, GitHub, atau username + password (akun dibuat &
// disimpan langsung di database Supabase lewat signUpWithUsername/signInWithUsername).

type Mode = 'login' | 'signup'

export function LoginPage({ onAuthed }: { onAuthed: (s: Session) => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) { setErr('Username dan password wajib diisi.'); return }
    setLoading(true); setErr('')
    try {
      const session = mode === 'login'
        ? await signInWithUsername(username, password)
        : await signUpWithUsername(username, password, whatsapp)
      onAuthed(session)
    } catch (e: any) {
      setErr(e?.message || 'Gagal memproses permintaan. Coba lagi.')
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setOauthLoading('google')
    try { await signInWithGoogle() } finally { setOauthLoading(null) }
  }

  async function handleGitHub() {
    setOauthLoading('github')
    try { await signInWithGitHub() } finally { setOauthLoading(null) }
  }

  function switchMode(m: Mode) {
    setMode(m); setErr(''); setPassword('')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8"><BrandMark size={32} /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white tracking-tight">{mode === 'login' ? 'Masuk ke akun' : 'Buat akun baru'}</h1>
          <p className="hint mt-2 mb-6">
            {mode === 'login' ? 'Pilih salah satu cara masuk di bawah ini.' : 'Cukup username, password, dan nomor WhatsApp (opsional).'}
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={handleGoogle} disabled={!configured || oauthLoading !== null}
              className="btn btn-lg btn-block relative"
              style={{ background: configured ? '#ffffff' : '#1f2940', color: configured ? '#0f172a' : '#94a3b8', opacity: 1 }}>
              {configured && !oauthLoading && (
                <span className="absolute -top-2 -right-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none text-white" style={{ background: '#4f7cff' }}>
                  Direkomendasikan
                </span>
              )}
              {oauthLoading === 'google'
                ? <span className="w-4 h-4 rounded-full border-2 border-[#0f172a]/25 border-t-[#0f172a] animate-spin" />
                : <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>}
              Google
            </button>

            <button onClick={handleGitHub} disabled={!configured || oauthLoading !== null}
              className="btn btn-lg btn-block"
              style={{ background: configured ? '#161b22' : '#1f2940', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)', opacity: 1 }}>
              {oauthLoading === 'github'
                ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.79-.25.79-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.19 1.78 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.08.78 2.18 0 1.58-.01 2.85-.01 3.24 0 .3.21.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" /></svg>}
              GitHub
            </button>
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span className="text-xs text-subtle">atau dengan username</span>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="label">Username</span>
              <div className="relative">
                <Icon name="user" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input className="input" style={{ paddingLeft: 36 }} value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="mis. tuyyistore" autoComplete="username" />
              </div>
            </label>

            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <Icon name="lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <input className="input" style={{ paddingLeft: 36, paddingRight: 36 }} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                <button type="button" onClick={() => setShowPassword(s => !s)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-white transition-colors duration-150"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </label>

            {mode === 'signup' && (
              <label className="block">
                <span className="label">Nomor WhatsApp <span className="text-subtle font-normal">(opsional)</span></span>
                <div className="relative">
                  <Icon name="phone" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <input className="input" style={{ paddingLeft: 36 }} value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                    placeholder="mis. 6281234567890" inputMode="tel" autoComplete="tel" />
                </div>
              </label>
            )}

            {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

            <button type="submit" disabled={!configured || loading} className="btn btn-primary btn-lg btn-block">
              {loading
                ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Memproses...</>
                : mode === 'login' ? 'Masuk' : 'Buat Akun'}
            </button>
          </form>

          <p className="hint text-center mt-4">
            {mode === 'login' ? (
              <>Belum punya akun username? <button onClick={() => switchMode('signup')} className="text-white font-medium hover:underline">Daftar di sini</button></>
            ) : (
              <>Sudah punya akun username? <button onClick={() => switchMode('login')} className="text-white font-medium hover:underline">Masuk di sini</button></>
            )}
          </p>

          {!configured && <div className="alert alert-warning mt-4"><Icon name="info" size={16} className="mt-0.5" /><span>Database belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Environment Variables Vercel.</span></div>}
        </div>
      </div>
    </div>
  )
}
