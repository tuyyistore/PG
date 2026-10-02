import { useCallback, useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon, formatRp, EmptyState, SkeletonRows } from '../ui'
import { useConfirm, useToast } from '../feedback'

const FIELD = 'input input-sm'
const EMPTY_VOUCHER = { code: '', kind: 'percent', value: '', max_discount: '', min_total: '', max_uses: '', expires_at: '' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[12px] font-medium text-slate-300 mb-1.5 block">{label}</span>{children}</label>
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try { setData(await fn()); setErr('') } catch (e) { setErr((e as Error).message) }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  return { data, err, reload: load }
}

export function AdminVouchers() {
  const toast = useToast()
  const ask = useConfirm()
  const { data, err, reload } = useLoad(() => api('vouchers?select=*&order=id.desc'))
  const [form, setForm] = useState(EMPTY_VOUCHER)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setMsg('')
    const value = Number(form.value)
    if (!form.code.trim() || !value) { setMsg('Kode dan nilai wajib diisi'); return }
    if (form.kind === 'percent' && value > 100) { setMsg('Persen maksimal 100'); return }
    setSaving(true)
    try {
      await api('vouchers', { method: 'POST', body: {
        code: form.code.trim().toUpperCase(), kind: form.kind, value,
        max_discount: Number(form.max_discount) || null, min_total: Number(form.min_total) || 0,
        max_uses: Number(form.max_uses) || null, expires_at: form.expires_at ? new Date(form.expires_at + 'T23:59:59').toISOString() : null,
      } })
      setForm(EMPTY_VOUCHER); toast('Voucher dibuat'); reload()
    } catch (e) { setMsg((e as Error).message) } finally { setSaving(false) }
  }

  async function toggle(v: Row) {
    try { await api(`vouchers?id=eq.${v.id}`, { method: 'PATCH', body: { active: !v.active } }); reload() } catch (e) { setMsg((e as Error).message) }
  }

  async function remove(v: Row) {
    if (!(await ask({ title: `Hapus voucher ${v.code}?`, description: 'Voucher tidak bisa dipakai lagi.', confirmLabel: 'Hapus', danger: true }))) return
    try { await api(`vouchers?id=eq.${v.id}`, { method: 'DELETE' }); toast('Voucher dihapus'); reload() } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <div className="space-y-4">
      {(err || msg) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || msg}</span></div>}
      <div className="card p-4 sm:p-5 space-y-4">
        <p className="section-title">Buat Voucher</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kode"><input className={FIELD} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="HEMAT10" /></Field>
          <Field label="Jenis">
            <select className={FIELD} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              <option value="percent">Persen (%)</option>
              <option value="fixed">Nominal (Rp)</option>
            </select>
          </Field>
          <Field label={form.kind === 'percent' ? 'Nilai (%)' : 'Nilai (Rp)'}><input className={FIELD} inputMode="numeric" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></Field>
          <Field label="Maks. potongan (Rp, opsional)"><input className={FIELD} inputMode="numeric" value={form.max_discount} onChange={e => setForm({ ...form, max_discount: e.target.value })} /></Field>
          <Field label="Min. belanja (Rp)"><input className={FIELD} inputMode="numeric" value={form.min_total} onChange={e => setForm({ ...form, min_total: e.target.value })} /></Field>
          <Field label="Kuota pemakaian (opsional)"><input className={FIELD} inputMode="numeric" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Berlaku sampai (opsional)"><input className={FIELD} type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} /></Field></div>
        </div>
        <div className="flex justify-end"><button onClick={save} disabled={saving} className="btn btn-sm btn-primary"><Icon name="plus" size={14} /> Buat Voucher</button></div>
      </div>

      <div className="card overflow-hidden">
        {!data ? <SkeletonRows rows={2} /> : data.length === 0 ? <EmptyState icon="tag" title="Belum ada voucher." /> : (
          <div className="divide-y divide-white/[0.06]">
            {data.map(v => (
              <div key={v.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white font-mono">{v.code}</p>
                  <p className="text-xs text-muted-foreground tabular">
                    {v.kind === 'percent' ? `${v.value}%` : formatRp(v.value)}
                    {v.max_discount ? ` (maks ${formatRp(v.max_discount)})` : ''} · terpakai {v.used_count}{v.max_uses ? `/${v.max_uses}` : ''}
                    {v.min_total > 0 ? ` · min ${formatRp(v.min_total)}` : ''}
                    {v.expires_at ? ` · s/d ${new Date(v.expires_at).toLocaleDateString('id-ID')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button onClick={() => toggle(v)} className={`badge badge-dot cursor-pointer ${v.active ? 'badge-success' : 'badge-neutral'}`} style={{ height: 32, padding: '0 12px' }}>{v.active ? 'Aktif' : 'Nonaktif'}</button>
                  <button onClick={() => remove(v)} className="btn btn-sm btn-danger" aria-label={`Hapus ${v.code}`}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AdminStock({ products }: { products: Row[] }) {
  const toast = useToast()
  const auto = products.filter(p => p.auto_delivery)
  const [pid, setPid] = useState<number | null>(auto[0]?.id ?? null)
  const [lines, setLines] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const { data, err, reload } = useLoad(() => api(`product_stock?select=id,product_id,sold_order_id&order=id.desc&limit=2000`))

  useEffect(() => { if (pid === null && auto[0]) setPid(auto[0].id) }, [auto.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const free = (id: number) => (data ?? []).filter(s => s.product_id === id && !s.sold_order_id).length
  const sold = (id: number) => (data ?? []).filter(s => s.product_id === id && s.sold_order_id).length

  async function add() {
    const rows = lines.split('\n').map(l => l.trim()).filter(Boolean)
    if (!pid || rows.length === 0) { setMsg('Pilih produk dan isi minimal satu baris'); return }
    setSaving(true); setMsg('')
    try {
      await api('product_stock', { method: 'POST', body: rows.map(data => ({ product_id: pid, data })) })
      setLines(''); toast(`${rows.length} stok ditambahkan`); reload()
    } catch (e) { setMsg((e as Error).message) } finally { setSaving(false) }
  }

  if (auto.length === 0) {
    return <div className="card"><EmptyState icon="package" title="Belum ada produk auto-delivery." description="Centang 'Kirim otomatis' di form produk, lalu isi stoknya di sini." /></div>
  }

  return (
    <div className="space-y-4">
      {(err || msg) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || msg}</span></div>}
      <div className="card p-4 sm:p-5 space-y-4">
        <p className="section-title">Tambah Stok</p>
        <Field label="Produk">
          <select className={FIELD} value={pid ?? ''} onChange={e => setPid(Number(e.target.value))}>
            {auto.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Satu baris = satu akun / item (data ini dikirim ke pembeli)">
          <textarea className="input" rows={6} value={lines} onChange={e => setLines(e.target.value)} placeholder={'email1@contoh.com|password1\nemail2@contoh.com|password2'} />
        </Field>
        <div className="flex justify-end"><button onClick={add} disabled={saving} className="btn btn-sm btn-primary"><Icon name="plus" size={14} /> Tambah Stok</button></div>
      </div>
      <div className="card overflow-hidden">
        <div className="divide-y divide-white/[0.06]">
          {auto.map(p => (
            <div key={p.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground tabular whitespace-nowrap">tersedia {data ? free(p.id) : '…'} · terjual {data ? sold(p.id) : '…'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AdminAudit() {
  const { data, err, reload } = useLoad(() => api('audit_log?select=*&order=id.desc&limit=100'))
  const label: Record<string, string> = { saldo: 'Saldo berubah', order: 'Pesanan diubah', topup: 'Top up diproses', reset_password: 'Reset password' }
  const describe = (r: Row) => {
    const x = r.detail ?? {}
    if (r.action === 'saldo') return `${formatRp(x.before ?? 0)} → ${formatRp(x.after ?? 0)} (${Number(x.delta) > 0 ? '+' : ''}${formatRp(x.delta ?? 0)})`
    if (r.action === 'order') return `${r.target}: ${x.status_before} → ${x.status_after}${x.data_changed ? ' · data akun diubah' : ''}`
    if (r.action === 'topup') return `#${r.target} ${formatRp(x.amount ?? 0)}: ${x.status_before} → ${x.status_after}`
    return r.target ?? ''
  }
  return (
    <div className="space-y-4">
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}
      <div className="flex justify-end"><button onClick={reload} className="btn btn-sm btn-secondary"><Icon name="refresh" size={14} /> Muat ulang</button></div>
      <div className="card overflow-hidden">
        {!data ? <SkeletonRows rows={3} /> : data.length === 0 ? <EmptyState icon="clipboard" title="Belum ada catatan." /> : (
          <div className="divide-y divide-white/[0.06]">
            {data.map(r => (
              <div key={r.id} className="px-4 sm:px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{label[r.action] ?? r.action}</p>
                  <p className="text-[11px] text-muted-foreground tabular whitespace-nowrap">{new Date(r.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <p className="text-xs text-muted-foreground tabular break-words">{describe(r)}</p>
                {r.action === 'saldo' && <p className="text-[11px] text-subtle font-mono truncate">user {String(r.target).slice(0, 8)}{r.actor ? ` · oleh ${String(r.actor).slice(0, 8)}` : ' · sistem'}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function AdminSettings() {
  const toast = useToast()
  const { data, err, reload } = useLoad(() => api('app_settings?select=key,value'))
  const [payInfo, setPayInfo] = useState<string | null>(null)
  const [adminWa, setAdminWa] = useState<string | null>(null)
  const [slaHrs, setSlaHrs] = useState<string | null>(null)
  const [autoHrs, setAutoHrs] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const cur = (k: string) => data?.find(r => r.key === k)?.value ?? ''
  const pay = payInfo ?? cur('pay_info')
  const wa = adminWa ?? cur('admin_wa')
  const sla = slaHrs ?? cur('pending_sla_hours')
  const auto = autoHrs ?? cur('pending_autorefund_hours')
  const hours = (v: string) => String(Math.max(0, Math.floor(Number(v.replace(/\D/g, '')) || 0)))

  async function save() {
    setSaving(true); setMsg('')
    try {
      await Promise.all([
        api('app_settings?key=eq.pay_info', { method: 'PATCH', body: { value: pay } }),
        api('app_settings?key=eq.admin_wa', { method: 'PATCH', body: { value: wa.trim() } }),
        api('app_settings?key=eq.pending_sla_hours', { method: 'PATCH', body: { value: hours(sla) } }),
        api('app_settings?key=eq.pending_autorefund_hours', { method: 'PATCH', body: { value: hours(auto) } }),
      ])
      toast('Pengaturan disimpan'); setPayInfo(null); setAdminWa(null); setSlaHrs(null); setAutoHrs(null); reload()
    } catch (e) { setMsg((e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {(err || msg) && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err || msg}</span></div>}
      <div className="card p-4 sm:p-5 space-y-4">
        <Field label="Info pembayaran top up (ditampilkan ke user, mis. nomor QRIS/DANA/rekening)">
          <textarea className="input" rows={4} value={pay} onChange={e => setPayInfo(e.target.value)} placeholder={'DANA 0812xxxxxxx a.n. Tuyyi\nBCA 1234567890 a.n. Tuyyi'} />
        </Field>
        <Field label="Nomor WhatsApp admin untuk notifikasi pesanan baru (opsional, mis. 6281234567890)">
          <input className={FIELD} inputMode="tel" value={wa} onChange={e => setAdminWa(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Pesanan pending dianggap terlambat setelah (jam, 0 = mati)">
            <input className={FIELD} inputMode="numeric" value={sla} onChange={e => setSlaHrs(e.target.value)} />
          </Field>
          <Field label="Batalkan + refund otomatis setelah (jam, 0 = mati)">
            <input className={FIELD} inputMode="numeric" value={auto} onChange={e => setAutoHrs(e.target.value)} />
          </Field>
        </div>
        <p className="hint">Pengingat ke WhatsApp admin dan auto-refund berjalan lewat jadwal pg_cron (lihat akhir migration_v13.sql).</p>
        <div className="flex justify-end"><button onClick={save} disabled={saving || !data} className="btn btn-sm btn-primary"><Icon name="check" size={14} strokeWidth={2.25} /> Simpan</button></div>
      </div>
    </div>
  )
}
