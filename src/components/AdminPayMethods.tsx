import { useCallback, useEffect, useState } from 'react'
import { api, uploadFile, type Row } from '../lib/supabase'
import { Icon, EmptyState, SkeletonRows } from '../ui'
import { useConfirm, useToast } from '../feedback'
import { Btn, Field, FIELD } from './adminKit'
import { PayLogo } from './PayLogo'

const MAX_LOGO_MB = 5
const EMPTY = { name: '', account_number: '', account_name: '', logo_url: '', active: true }

export function AdminPayMethods() {
  const toast = useToast()
  const ask = useConfirm()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try { setRows(await api('payment_methods?select=*&order=sort,id')); setErr('') }
    catch (e) { setErr((e as Error).message); setRows([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const reset = () => { setForm(EMPTY); setEditId(null) }

  async function save() {
    if (!form.name.trim()) { setErr('Nama bank / e-wallet wajib diisi'); return }
    setSaving(true); setErr('')
    try {
      const body = {
        name: form.name.trim(), account_number: form.account_number.trim(), account_name: form.account_name.trim(),
        logo_url: form.logo_url || null, active: form.active,
      }
      if (editId) await api(`payment_methods?id=eq.${editId}`, { method: 'PATCH', body })
      else await api('payment_methods', { method: 'POST', body: { ...body, sort: (rows ?? []).reduce((m, r) => Math.max(m, Number(r.sort) || 0), -1) + 1 } })
      toast(editId ? 'Metode bayar disimpan' : 'Metode bayar ditambahkan')
      reset(); await load()
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  const startEdit = (m: Row) => {
    setForm({ name: m.name, account_number: m.account_number ?? '', account_name: m.account_name ?? '', logo_url: m.logo_url ?? '', active: Boolean(m.active) })
    setEditId(m.id); setErr(''); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function toggle(m: Row) {
    try { await api(`payment_methods?id=eq.${m.id}`, { method: 'PATCH', body: { active: !m.active } }); await load() }
    catch (e) { setErr((e as Error).message) }
  }

  async function remove(m: Row) {
    if (!(await ask({ title: `Hapus metode "${m.name}"?`, description: 'Metode ini tidak akan tampil lagi di halaman Saldo.', confirmLabel: 'Hapus', danger: true }))) return
    try { await api(`payment_methods?id=eq.${m.id}`, { method: 'DELETE' }); if (editId === m.id) reset(); toast('Metode bayar dihapus'); await load() }
    catch (e) { setErr((e as Error).message) }
  }

  async function uploadLogo(file: File) {
    if (file.size > MAX_LOGO_MB * 1024 * 1024) { setErr(`Ukuran logo maksimal ${MAX_LOGO_MB} MB`); return }
    setUploading(true); setErr('')
    try {
      const ext = file.name.split('.').pop() || 'png'
      const url = await uploadFile('products', `payment/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`, file)
      setForm(f => ({ ...f, logo_url: url }))
    } catch (e) { setErr('Gagal unggah logo: ' + (e as Error).message) } finally { setUploading(false) }
  }

  return (
    <div className="space-y-4">
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5 flex-shrink-0" /><span>{err}</span></div>}

      <div className="card p-4 sm:p-5 space-y-4">
        <div>
          <h2 className="section-title">{editId ? 'Edit metode bayar' : 'Tambah metode bayar'}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Tampil di halaman Saldo, di bawah QRIS ("Metode lain").</p>
        </div>
        <Field label="Nama bank / e-wallet">
          <input className={FIELD} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="mis. GoPay" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nomor rekening / e-wallet">
            <input className={FIELD} inputMode="numeric" value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} placeholder="mis. 081234567890" />
          </Field>
          <Field label="Atas nama">
            <input className={FIELD} value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} placeholder="mis. Tuyyi Store" />
          </Field>
        </div>
        <Field label={`Logo (maks ${MAX_LOGO_MB} MB)`}>
          <div className="flex items-center gap-3">
            <PayLogo url={form.logo_url} name={form.name || '?'} size={40} />
            <label className="flex-1 min-w-0">
              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = '' }} />
              <span className="input input-sm cursor-pointer flex items-center gap-2 text-slate-300"><Icon name="upload" size={14} /> <span className="truncate">{uploading ? 'Mengunggah...' : (form.logo_url ? 'Ganti logo' : 'Pilih logo')}</span></span>
            </label>
            {form.logo_url && <Btn onClick={() => setForm(f => ({ ...f, logo_url: '' }))} variant="ghost"><Icon name="x" size={14} /></Btn>}
          </div>
        </Field>
        <label className="flex items-center gap-2.5 text-[13px] text-slate-200 cursor-pointer select-none">
          <input type="checkbox" className="w-4 h-4 rounded accent-[#4f7cff]" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Tampilkan ke pengguna
        </label>
        <p className="hint">Metode yang nomornya masih kosong tidak akan tampil ke pengguna, walaupun statusnya aktif.</p>
        <div className="flex justify-end gap-2">
          {editId && <Btn onClick={reset} variant="ghost">Batal</Btn>}
          <button type="button" onClick={save} disabled={saving || uploading} className="btn btn-sm btn-primary">
            <Icon name={editId ? 'check' : 'plus'} size={14} strokeWidth={2.25} /> {saving ? 'Menyimpan...' : editId ? 'Simpan perubahan' : 'Tambah metode'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows === null ? <SkeletonRows rows={3} thumb={40} /> : rows.length === 0 ? (
          <EmptyState icon="wallet" title="Belum ada metode bayar" description="Tambahkan GoPay, OVO, bank, atau e-wallet lain di atas." />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {rows.map(m => {
              const filled = String(m.account_number ?? '').trim() !== ''
              return (
                <div key={m.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <PayLogo url={m.logo_url} name={m.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{m.name}</p>
                    {filled
                      ? <p className="text-xs text-slate-300 tabular break-all">{m.account_number}{m.account_name ? ` · a.n. ${m.account_name}` : ''}</p>
                      : <p className="text-xs" style={{ color: '#fbbf24' }}>Nomor belum diisi, belum tampil ke pengguna</p>}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Btn onClick={() => toggle(m)} variant={m.active ? 'success' : 'ghost'}>{m.active ? 'Aktif' : 'Nonaktif'}</Btn>
                    <Btn onClick={() => startEdit(m)} variant="ghost"><Icon name="edit" size={14} /></Btn>
                    <Btn onClick={() => remove(m)} variant="danger"><Icon name="trash" size={14} /></Btn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
