import { useMemo, useState } from 'react'
import { api, apiFn, MIN_PASSWORD_LENGTH, type Row } from '../lib/supabase'
import { Icon, formatRp, EmptyState, SkeletonRows } from '../ui'
import { useToast } from '../feedback'
import { rowHandle } from '../lib/notifications'
import { Btn, Field, Modal, MUTED, Pager, downloadCsv, fetchAllRows, ilikeOr, useDebounced, usePaged } from './adminKit'

const PAGE = 50

export function AdminUsers({ onChanged, onMessage }: { onChanged: () => void; onMessage: (u: Row) => void }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const dq = useDebounced(search)
  const [detailUser, setDetailUser] = useState<Row | null>(null)
  const [saldoAmount, setSaldoAmount] = useState('')
  const [resetPw, setResetPw] = useState('')
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)

  const base = useMemo(
    () => `profiles?select=*&order=created_at.desc${ilikeOr(['email', 'user_code', 'username', 'full_name', 'whatsapp'], dq)}`,
    [dq],
  )
  const { rows, total, loading, err: loadErr, offset, setOffset, reload } = usePaged(base, PAGE)
  const q = dq.trim()

  const copyUserId = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast('ID pengguna disalin: ' + code) }
    catch { toast('Gagal menyalin ID pengguna', 'error') }
  }

  const adjustSaldo = async (delta: number) => {
    if (!detailUser || !delta) return
    try {
      await api('rpc/admin_adjust_saldo', { method: 'POST', body: { target_uid: detailUser.id, delta } })
      toast(delta > 0 ? 'Saldo berhasil ditambahkan' : 'Saldo berhasil dikembalikan')
      setSaldoAmount('')
      setDetailUser(u => u ? { ...u, saldo: Math.max(0, Number(u.saldo ?? 0) + delta) } : u)
      reload(); onChanged(); setErr('')
    } catch (e) { setErr((e as Error).message) }
  }

  async function doResetPassword() {
    if (!detailUser) return
    if (resetPw.length < MIN_PASSWORD_LENGTH) { setErr(`Password baru minimal ${MIN_PASSWORD_LENGTH} karakter`); return }
    try {
      await apiFn('admin-reset-password', { method: 'POST', body: { user_id: detailUser.id, new_password: resetPw } })
      setResetPw(''); setErr(''); toast('Password berhasil direset')
    } catch (e) { setErr((e as Error).message) }
  }

  async function exportUsers() {
    setExporting(true); setErr('')
    try {
      const all = await fetchAllRows(base)
      downloadCsv(`pengguna-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['ID', 'Email/Username', 'Nama', 'WhatsApp', 'WA terverifikasi', 'Saldo', 'Bergabung'],
        ...all.map(u => [u.user_code ?? '', rowHandle(u), u.full_name ?? '', u.whatsapp ?? '', u.whatsapp_verified ? 'ya' : 'tidak', u.saldo ?? 0, new Date(u.created_at).toLocaleString('id-ID')]),
      ])
    } catch (e) { setErr((e as Error).message) } finally { setExporting(false) }
  }

  const closeDetail = () => { setDetailUser(null); setSaldoAmount(''); setResetPw('') }

  return (
    <div className="space-y-4">
      {(err || loadErr) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || loadErr}</span></div>}
      <div className="card p-4 sm:p-5 space-y-2">
        <Field label="Cari pengguna (email, ID pengguna, username, atau nomor WhatsApp)">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={MUTED}><Icon name="search" size={16} /></span>
            <input className="input" style={{ paddingLeft: 40 }} placeholder="mis. nama@gmail.com atau USR-K7M2QX9P" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </Field>
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="hint">{q ? (total > 0 ? `Ditemukan ${total} pengguna cocok.` : 'Pengguna tidak terdaftar.') : `${total} pengguna.`}</p>
          <Btn onClick={exportUsers} variant="secondary" disabled={exporting || total === 0}><Icon name="upload" size={14} /> {exporting ? 'Menyiapkan...' : 'Ekspor CSV'}</Btn>
        </div>
      </div>

      <div className={`card overflow-hidden transition-opacity ${loading && rows.length > 0 ? 'opacity-60' : ''}`}>
        {loading && rows.length === 0 ? <SkeletonRows rows={4} /> : rows.length === 0 ? (
          <EmptyState icon="users" title={q ? `Tidak ada pengguna yang cocok dengan "${search}"` : 'Belum ada pengguna.'} />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {rows.map(u => (
              <div key={u.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 transition-colors duration-200 hover:bg-white/[0.02]">
                <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="mail" size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{rowHandle(u)}</p>
                  {u.user_code && <p className="text-[11px] text-muted-foreground font-mono truncate">{u.user_code}</p>}
                </div>
                <Btn onClick={() => setDetailUser(u)} variant="secondary"><Icon name="eye" size={14} /> Detail</Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      <Pager offset={offset} limit={PAGE} total={total} onChange={setOffset} />

      {detailUser && (
        <Modal title="Detail Pengguna" onClose={closeDetail}>
          <div className="flex items-center gap-3">
            <div className="icon-tile" style={{ width: 44, height: 44 }}><Icon name="mail" size={18} /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{rowHandle(detailUser)}</p>
              <p className="text-xs text-muted-foreground">{detailUser.full_name ?? 'Tanpa nama'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="card-inset p-3"><p className="text-[11px] text-muted-foreground">Bergabung</p><p className="text-[13px] text-white font-medium mt-0.5">{new Date(detailUser.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            <div className="card-inset p-3"><p className="text-[11px] text-muted-foreground">Saldo sekarang</p><p className="text-[13px] text-white font-medium tabular mt-0.5">{formatRp(detailUser.saldo ?? 0)}</p></div>
            <div className="card-inset p-3 col-span-2 flex items-center gap-2">
              <div className="min-w-0 flex-1"><p className="text-[11px] text-muted-foreground">ID pengguna</p><p className="text-[13px] text-white font-medium font-mono mt-0.5 truncate">{detailUser.user_code ?? '-'}</p></div>
              {detailUser.user_code && <button onClick={() => copyUserId(detailUser.user_code)} className="btn btn-ghost btn-sm" aria-label="Salin ID pengguna"><Icon name="copy" size={14} /> Salin</button>}
            </div>
            <div className="card-inset p-3 col-span-2">
              <p className="text-[11px] text-muted-foreground">Nomor HP / WhatsApp</p>
              <p className="text-[13px] text-white font-medium mt-0.5">
                {detailUser.whatsapp || '-'}
                {detailUser.whatsapp && <span className={`badge ml-2 ${detailUser.whatsapp_verified ? 'badge-success' : 'badge-neutral'}`}>{detailUser.whatsapp_verified ? 'Terverifikasi' : 'Belum diverifikasi'}</span>}
              </p>
            </div>
          </div>
          <Field label="Nominal (Rp)">
            <input className="input" inputMode="numeric" placeholder="mis. 50000" value={saldoAmount} onChange={e => setSaldoAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => adjustSaldo(Number(saldoAmount.replace(/\D/g, '')))} disabled={!saldoAmount} className="btn btn-primary"><Icon name="plus" size={15} /> Tambah Saldo</button>
            <button onClick={() => adjustSaldo(-Number(saldoAmount.replace(/\D/g, '')))} disabled={!saldoAmount} className="btn btn-secondary"><Icon name="wallet" size={15} /> Refund / Kembalikan</button>
          </div>
          {String(detailUser.email ?? '').endsWith('@users.tuyyistore.internal') && (
            <div className="space-y-2">
              <Field label="Reset password akun username">
                <div className="flex gap-2">
                  <input className="input" type="text" value={resetPw} onChange={e => setResetPw(e.target.value)} placeholder={`Password baru (min. ${MIN_PASSWORD_LENGTH} karakter)`} autoComplete="off" />
                  <button onClick={doResetPassword} disabled={resetPw.length < MIN_PASSWORD_LENGTH} className="btn btn-secondary flex-shrink-0">Reset</button>
                </div>
              </Field>
            </div>
          )}
          <button onClick={() => { const u = detailUser; closeDetail(); onMessage(u) }} className="btn btn-secondary w-full"><Icon name="send" size={15} /> Kirim Pesan ke Pengguna Ini</button>
        </Modal>
      )}
    </div>
  )
}
