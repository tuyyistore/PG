import { configured, signInWithGoogle } from '../lib/supabase'
import { Icon } from '../ui'
import { BrandMark } from '../components/Brand'

export function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-8"><BrandMark size={32} /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-white tracking-tight">Masuk ke akun</h1>
          <p className="hint mt-2 mb-6">Lanjutkan dengan akun Google. Admin masuk dengan email Google yang terdaftar sebagai admin.</p>
          <button onClick={signInWithGoogle} disabled={!configured}
            className="btn btn-lg btn-block"
            style={{ background: configured ? '#ffffff' : '#1f2940', color: configured ? '#0f172a' : '#94a3b8', opacity: 1 }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
            Lanjutkan dengan Google
          </button>
          {!configured && <div className="alert alert-warning mt-4"><Icon name="info" size={16} className="mt-0.5" /><span>Database belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Environment Variables Vercel.</span></div>}
        </div>
        <p className="hint text-center mt-6 flex items-center justify-center gap-1.5"><Icon name="lock" size={13} /> Login aman melalui Google OAuth</p>
      </div>
    </div>
  )
}
