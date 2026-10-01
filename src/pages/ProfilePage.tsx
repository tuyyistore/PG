import { useState } from 'react'
import { api, displayName, uploadFile, type Row, type SessionUser } from '../lib/supabase'
import { Icon, PageHeader } from '../ui'
import { useToast } from '../feedback'
import { Avatar } from '../components/Brand'

// ─── Profile Page ─────────────────────────────────────────────────────────────

export const MAX_AVATAR_MB = 10

export function ProfilePage({ user, isAdmin, profile, onSaved }: { user: SessionUser; isAdmin: boolean; profile: Row | null; onSaved: (patch: Row) => void }) {
  const [name, setName] = useState(profile?.full_name ?? displayName(user))
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '')
  const [contactEmail, setContactEmail] = useState(profile?.contact_email ?? user.email ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr('')
    try {
      await api(`profiles?id=eq.${user.id}`, { method: 'PATCH', body: { full_name: name.trim() || null, whatsapp: whatsapp.trim() || null, contact_email: contactEmail.trim() || null, avatar_url: avatarUrl || null } })
      onSaved({ full_name: name.trim(), whatsapp: whatsapp.trim(), contact_email: contactEmail.trim(), avatar_url: avatarUrl })
      toast('Pengaturan berhasil disimpan')
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  async function copyUserId() {
    try { await navigator.clipboard.writeText(profile?.user_code ?? ''); toast('ID pengguna disalin: ' + profile?.user_code) }
    catch { toast('Gagal menyalin ID pengguna', 'error') }
  }

  const [refInput, setRefInput] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  const refLink = profile?.user_code ? `${location.origin}/?ref=${profile.user_code}` : ''

  async function copyRefLink() {
    try { await navigator.clipboard.writeText(refLink); toast('Link referral disalin') }
    catch { toast('Gagal menyalin link referral', 'error') }
  }

  async function applyRef() {
    if (!refInput.trim()) return
    setRefBusy(true); setErr('')
    try {
      await api('rpc/apply_referral', { method: 'POST', body: { p_code: refInput.trim() } })
      onSaved({ referred_by: 'set' })
      setRefInput('')
      toast('Kode referral berhasil dipakai')
    } catch (e) { setErr((e as Error).message) } finally { setRefBusy(false) }
  }

  async function pickAvatar(file: File) {
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) { setErr(`Ukuran foto maksimal ${MAX_AVATAR_MB} MB`); return }
    setUploading(true); setErr('')
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const url = await uploadFile('avatars', `${user.id}/${Date.now()}.${ext}`, file)
      setAvatarUrl(url)
    } catch (e) { setErr('Gagal unggah foto: ' + (e as Error).message) } finally { setUploading(false) }
  }

  const fakeUser: SessionUser = { ...user, user_metadata: { ...user.user_metadata, avatar_url: avatarUrl } }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Pengaturan" subtitle="Kelola profil dan data kontak untuk pembelian." />

      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

      {/* Profile section */}
      <section className="card">
        <div className="px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="section-title">Profil</h2>
          <p className="hint mt-1">Foto dan nama yang ditampilkan di akunmu.</p>
        </div>
        <div className="px-5 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar user={fakeUser} size={72} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-semibold text-white truncate">{name || displayName(user)}</p>
              {isAdmin && <span className="badge badge-primary"><Icon name="shield" size={12} /> Admin</span>}
            </div>
            <p className="text-[13px] text-muted-foreground truncate">{user.email}</p>
            <p className="hint mt-1">JPG, PNG atau GIF. Maksimal {MAX_AVATAR_MB} MB.</p>
          </div>
          <label className={`btn btn-secondary cursor-pointer self-start sm:self-center ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && pickAvatar(e.target.files[0])} />
            {uploading ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Icon name="upload" size={16} />}
            {uploading ? 'Mengunggah...' : 'Ganti Foto Profil'}
          </label>
        </div>
        <div className="px-5 sm:px-6 pb-6">
          <label className="block max-w-md">
            <span className="label">Nama lengkap</span>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nama kamu" />
          </label>
        </div>
        {profile?.user_code && (
          <div className="px-5 sm:px-6 pb-6">
            <span className="label">ID Pengguna</span>
            <div className="flex items-center gap-2 card-inset pl-3.5 pr-1.5 py-1.5 max-w-md">
              <span className="text-[13px] font-medium text-white flex-1 truncate font-mono">{profile.user_code}</span>
              <button onClick={copyUserId} className="btn btn-ghost btn-sm" aria-label="Salin ID pengguna"><Icon name="copy" size={14} /> Salin ID</button>
            </div>
            <p className="hint mt-1.5">Sebutkan ID ini saat menghubungi admin.</p>
          </div>
        )}
      </section>

      {profile?.user_code && (
        <section className="card">
          <div className="px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 className="section-title">Ajak teman</h2>
            <p className="hint mt-1">Bagikan link ini. Kamu dapat bonus saldo Rp 2.000 saat temanmu menyelesaikan pembelian pertamanya.</p>
          </div>
          <div className="px-5 sm:px-6 py-6 space-y-5">
            <div className="flex items-center gap-2 card-inset pl-3.5 pr-1.5 py-1.5 max-w-xl">
              <span className="text-[13px] font-medium text-white flex-1 truncate font-mono">{refLink}</span>
              <button onClick={copyRefLink} className="btn btn-ghost btn-sm" aria-label="Salin link referral"><Icon name="copy" size={14} /> Salin</button>
            </div>
            {!profile?.referred_by && (
              <div className="max-w-md">
                <span className="label">Punya kode referral dari teman?</span>
                <div className="flex gap-2">
                  <input className="input" value={refInput} onChange={e => setRefInput(e.target.value.toUpperCase())} placeholder="USR-XXXXXXXX" />
                  <button onClick={applyRef} disabled={refBusy || !refInput.trim()} className="btn btn-secondary flex-shrink-0">{refBusy ? '...' : 'Pakai'}</button>
                </div>
                <p className="hint mt-1.5">Hanya bisa dipakai sebelum pembelian pertama.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Contact section */}
      <section className="card">
        <div className="px-5 sm:px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 className="section-title">Kontak pembelian</h2>
          <p className="hint mt-1">Email &amp; nomor WhatsApp ini otomatis dipakai untuk mengisi data pembelian saat checkout.</p>
        </div>
        <div className="px-5 sm:px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <label className="block">
            <span className="label">Nomor WhatsApp</span>
            <input className="input" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="mis. 6281234567890" inputMode="tel" />
          </label>
          <label className="block">
            <span className="label">Email untuk isi otomatis pembelian</span>
            <input className="input" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@contoh.com" type="email" />
          </label>
        </div>
        <div className="px-5 sm:px-6 py-4 flex sm:justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)', borderRadius: '0 0 16px 16px' }}>
          <button onClick={save} disabled={saving} className="btn btn-primary w-full sm:w-auto">
            {saving ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Menyimpan...</> : <><Icon name="check" size={16} strokeWidth={2.25} /> Simpan Pengaturan</>}
          </button>
        </div>
      </section>
    </div>
  )
}
