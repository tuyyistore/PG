import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/supabase'
import { Icon } from '../ui'
import { useConfirm, useToast } from '../feedback'
import { Btn, Field, FIELD, FIELD_STYLE } from './adminKit'

type BotStatus = 'offline' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'logged_out'
type Bot = {
  status: BotStatus; phone: string | null; pair_phone: string | null; qr: string | null
  pairing_code: string | null; last_error: string | null; heartbeat_at: string | null
}
type Stats = { pending: number; sent_24h: number; failed_24h: number }

const STALE_MS = 45_000 // bot mengirim heartbeat tiap ±15 dtk; lebih lama dari ini = bot tidak berjalan
const digits = (v: string) => v.replace(/\D/g, '')

const STATUS_UI: Record<BotStatus, { label: string; badge: string }> = {
  connected: { label: 'Terhubung', badge: 'badge-success' },
  connecting: { label: 'Menyambung', badge: 'badge-warning' },
  qr: { label: 'Menunggu scan QR', badge: 'badge-warning' },
  pairing: { label: 'Menunggu kode', badge: 'badge-warning' },
  logged_out: { label: 'Logout', badge: 'badge-neutral' },
  offline: { label: 'Belum tertaut', badge: 'badge-neutral' },
}

export function AdminBot() {
  const toast = useToast()
  const ask = useConfirm()
  const [bot, setBot] = useState<Bot | null | undefined>(undefined) // undefined = belum dimuat, null = baris belum ada
  const [stats, setStats] = useState<Stats | null>(null)
  const [err, setErr] = useState('')
  const [method, setMethod] = useState<'qr' | 'pair'>('qr')
  const [pairPhone, setPairPhone] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBot = useCallback(async () => {
    if (document.hidden) return
    try { const r = await api<Bot[]>('wa_bot?select=*&id=eq.1'); setBot(r[0] ?? null); setErr('') }
    catch (e) { setErr((e as Error).message); setBot(b => b ?? null) }
  }, [])
  const loadStats = useCallback(async () => {
    if (document.hidden) return
    try { setStats(await api<Stats>('rpc/admin_wa_stats', { method: 'POST', body: {} })) } catch { /* ditampilkan lewat loadBot */ }
  }, [])

  // Sinkron dengan bot: polling status ringan selama tab ini terbuka.
  useEffect(() => {
    loadBot(); loadStats()
    const a = setInterval(loadBot, 2500)
    const b = setInterval(loadStats, 15000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [loadBot, loadStats])

  async function command(action: 'connect_qr' | 'connect_pair' | 'logout' | 'restart', phone?: string, ok?: string) {
    setBusy(true)
    try {
      await api('rpc/admin_wa_bot_command', { method: 'POST', body: { p_action: action, p_phone: phone ?? null } })
      if (ok) toast(ok)
      setErr(''); await loadBot()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function sendTest() {
    setBusy(true)
    try {
      await api('rpc/admin_wa_test', { method: 'POST', body: { p_phone: testPhone } })
      toast('Pesan uji masuk antrean'); setErr(''); loadStats()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  async function disconnect() {
    if (await ask({ title: 'Putuskan bot WhatsApp?', description: 'Nomor dikeluarkan dari perangkat tertaut. OTP dan notifikasi berhenti sampai bot disambungkan lagi.', confirmLabel: 'Putuskan', danger: true }))
      command('logout', undefined, 'Perintah putuskan dikirim ke bot')
  }

  if (bot === undefined) return <div className="card p-5 text-sm text-muted-foreground">Memuat status bot…</div>

  const ageMs = bot?.heartbeat_at ? Date.now() - new Date(bot.heartbeat_at).getTime() : Infinity
  const online = ageMs < STALE_MS
  const status: BotStatus = bot?.status ?? 'offline'
  const ui = online ? STATUS_UI[status] : { label: 'Bot mati', badge: 'badge-danger' }
  const connected = online && status === 'connected'
  const inProgress = online && (status === 'connecting' || status === 'qr' || status === 'pairing')
  const pairValid = digits(pairPhone).length >= 9
  const copyCode = async () => {
    try { await navigator.clipboard.writeText((bot?.pairing_code ?? '').replace(/-/g, '')); toast('Kode disalin') } catch { /* abaikan */ }
  }

  return (
    <div className="space-y-4">
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}
      {bot === null && !err && (
        <div className="alert alert-warning"><Icon name="info" size={16} className="mt-0.5" /><span>Tabel status bot belum ada. Jalankan <b>supabase/migration_v15.sql</b> di Supabase SQL Editor.</span></div>
      )}

      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="icon-tile"><Icon name="phone" size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="section-title">Bot WhatsApp</p>
            <p className="text-xs text-muted-foreground truncate">
              {connected && bot?.phone ? `+${bot.phone}` : 'Mengirim OTP dan notifikasi pesanan/saldo'}
            </p>
          </div>
          <span className={`badge badge-dot ${ui.badge}`}>{ui.label}</span>
        </div>

        {!online && bot && (
          <div className="alert alert-warning"><Icon name="info" size={16} className="mt-0.5" /><span>
            Proses bot tidak berjalan di server{Number.isFinite(ageMs) ? ` (terakhir aktif ${Math.round(ageMs / 60000)} menit lalu)` : ''}. Jalankan <b>npm start</b> di folder <b>bot/</b> pada VPS. Perintah dari sini diproses begitu bot menyala.
          </span></div>
        )}
        {bot?.last_error && !connected && (
          <div className="alert alert-warning"><Icon name="info" size={16} className="mt-0.5" /><span>{bot.last_error}</span></div>
        )}

        {connected ? (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => command('restart', undefined, 'Bot dimulai ulang')} variant="secondary" disabled={busy}><Icon name="refresh" size={14} /> Mulai Ulang</Btn>
            <Btn onClick={disconnect} variant="danger" disabled={busy}><Icon name="power" size={14} /> Putuskan</Btn>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              {([['qr', 'QR Code'], ['pair', 'Kode Pairing']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setMethod(id)} className={`chip ${method === id ? 'chip-active' : ''}`}>{label}</button>
              ))}
            </div>
            {method === 'pair' && (
              <Field label="Nomor WhatsApp untuk bot (dengan kode negara, mis. 6281234567890)">
                <input className={FIELD} style={FIELD_STYLE} inputMode="tel" value={pairPhone} onChange={e => setPairPhone(e.target.value)} placeholder="6281234567890" />
              </Field>
            )}
            <Btn
              onClick={() => method === 'qr' ? command('connect_qr') : command('connect_pair', pairPhone)}
              variant="primary" disabled={busy || bot === null || (method === 'pair' && !pairValid)}>
              <Icon name={method === 'qr' ? 'qr' : 'phone'} size={14} /> {inProgress ? 'Mulai Ulang Proses' : 'Sambungkan'}
            </Btn>

            {online && status === 'connecting' && <p className="hint">Bot sedang menyiapkan koneksi…</p>}
            {online && status === 'qr' && bot?.qr && (
              <div className="space-y-3">
                <div className="inline-block rounded-xl bg-white p-3"><img src={bot.qr} alt="QR WhatsApp" width={240} height={240} style={{ display: 'block', width: 240, height: 240 }} /></div>
                <p className="hint">Di ponsel: WhatsApp → Pengaturan → Perangkat tertaut → Tautkan perangkat → pindai QR ini. QR diperbarui otomatis.</p>
              </div>
            )}
            {online && status === 'pairing' && bot?.pairing_code && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-3xl font-semibold text-white tracking-[0.2em] font-mono tabular">{bot.pairing_code}</p>
                  <Btn onClick={copyCode} variant="secondary"><Icon name="copy" size={14} /> Salin</Btn>
                </div>
                <p className="hint">Di ponsel{bot.pair_phone ? ` (+${bot.pair_phone})` : ''}: WhatsApp → Pengaturan → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon saja → masukkan kode ini. Kode berlaku beberapa menit.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {([['Antrean', stats.pending], ['Terkirim 24 jam', stats.sent_24h], ['Gagal 24 jam', stats.failed_24h]] as [string, number][]).map(([label, val]) => (
            <div key={label} className="card-inset p-4">
              <p className="text-[12px] text-muted-foreground">{label}</p>
              <p className="text-base font-semibold text-white tabular mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      )}

      {connected && (
        <div className="card p-4 sm:p-5 space-y-3">
          <p className="section-title">Kirim pesan uji</p>
          <div className="flex gap-2">
            <input className={FIELD} style={FIELD_STYLE} inputMode="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="6281234567890" />
            <Btn onClick={sendTest} variant="secondary" disabled={busy || digits(testPhone).length < 9}><Icon name="send" size={14} /> Kirim</Btn>
          </div>
          <p className="hint">Pesan masuk antrean yang sama dengan notifikasi lain dan dikirim bot dalam beberapa detik.</p>
        </div>
      )}
    </div>
  )
}
