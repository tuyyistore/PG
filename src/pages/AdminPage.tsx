import { useCallback, useEffect, useState } from 'react'
import { api, uploadFile, type Row } from '../lib/supabase'
import { Icon, formatRp, ProductThumb, PageHeader, EmptyState, SkeletonRows, type IconName } from '../ui'
import { useConfirm, useToast } from '../feedback'
import { AdminMessages } from '../components/AdminMessages'
import { AdminVouchers, AdminStock, AdminAudit, AdminSettings } from '../components/AdminExtras'
import { AdminOrders } from '../components/AdminOrders'
import { AdminUsers } from '../components/AdminUsers'
import { AdminTopups } from '../components/AdminTopups'
import { AdminBot } from '../components/AdminBot'
import { Btn, Field, FIELD, FIELD_STYLE } from '../components/adminKit'

const TABS = [['ringkasan', 'Ringkasan'], ['pesanan', 'Pesanan'], ['produk', 'Produk'], ['topup', 'Top Up'], ['pengguna', 'Pengguna'], ['voucher', 'Voucher'], ['stok', 'Stok'], ['pesan', 'Pesan'], ['bot', 'Bot WA'], ['audit', 'Audit'], ['pengaturan', 'Pengaturan']] as const
const EMPTY = { name: '', category: '', tagline: '', price: '', original_price: '', period: '/bln', features: '', badge: '', popular: false, logo_url: '', auto_delivery: false, stock: '' }
const MAX_LOGO_MB = 10

type Stats = {
  users: number; orders: number; orders_pending: number; topups_pending: number
  revenue: number; revenue_delivered: number; pending_value: number; refunded: number; late: number
  monthly: { month: string; total: number }[]
}

export default function AdminPage({ onChanged }: { onChanged: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('ringkasan')
  const [d, setD] = useState<{ products: Row[]; categories: Row[] }>({ products: [], categories: [] })
  const [stats, setStats] = useState<Stats | null>(null)
  // Daftar pengguna hanya dimuat untuk pratinjau penerima di tab Pesan (maks. 1000). Tab Pengguna memakai paginasi server.
  const [users, setUsers] = useState<Row[] | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const toast = useToast()
  const ask = useConfirm()
  const [loaded, setLoaded] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [msgPrefill, setMsgPrefill] = useState<{ target: string; n: number } | null>(null)
  const [slaHours, setSlaHours] = useState(24) // 0 = penanda "terlambat" dimatikan

  const loadStats = useCallback(async () => {
    try { setStats(await api<Stats>('rpc/admin_stats', { method: 'POST', body: {} })) }
    catch (e) { setErr((e as Error).message) }
  }, [])

  const load = useCallback(async () => {
    try {
      const [products, categories, settings] = await Promise.all([
        api('products?select=*&order=sort,id'), api('categories?select=*&order=sort,id'),
        api('app_settings?select=key,value').catch(() => [] as Row[]),
      ])
      const rawSla = settings.find((x: Row) => x.key === 'pending_sla_hours')?.value
      const sla = rawSla === undefined || rawSla === '' ? 24 : Number(rawSla)
      setSlaHours(Number.isFinite(sla) && sla >= 0 ? sla : 24)
      setD({ products, categories }); setErr('')
    } catch (e) { setErr((e as Error).message) } finally { setLoaded(true) }
  }, [])
  useEffect(() => { load(); loadStats() }, [load, loadStats])

  useEffect(() => {
    if (tab !== 'pesan' || users) return
    api('profiles?select=*&order=created_at.desc&limit=1000').then(setUsers).catch(() => setUsers([]))
  }, [tab, users])

  // Pengaturan (jam SLA, dll.) bisa berubah, muat ulang saat keluar dari tab itu.
  const goTab = (id: (typeof TABS)[number][0]) => { if (tab === 'pengaturan') load(); setTab(id) }
  const refreshAll = () => { loadStats(); onChanged() }

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn(); await load(); onChanged(); setErr('')
      if (msg) toast(msg)
    } catch (e) { setErr((e as Error).message) }
  }
  const categoryNames = d.categories.map(c => c.name)

  // Kategori baru bisa langsung dipakai; jaga supaya form selalu punya kategori aktif yang valid.
  useEffect(() => {
    if (categoryNames.length && !categoryNames.includes(form.category)) {
      setForm(f => ({ ...f, category: categoryNames[0] }))
    }
  }, [d.categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const monthly = (stats?.monthly ?? []).map(m => ({
    label: new Date(m.month + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'short' }),
    total: Number(m.total),
  }))
  const monthlyMax = Math.max(...monthly.map(m => m.total), 1)

  const saveProduct = () => run(async () => {
    if (!form.name.trim() || !Number(form.price)) throw new Error('Nama dan harga wajib diisi')
    if (!form.category) throw new Error('Tambahkan kategori dulu di Kelola Kategori')
    const body = {
      name: form.name.trim(), category: form.category, tagline: form.tagline, price: Number(form.price),
      original_price: Number(form.original_price) || null, period: form.period,
      features: form.features.split(',').map(s => s.trim()).filter(Boolean),
      badge: form.badge.trim() || null, popular: form.popular,
      logo_url: form.logo_url || null,
      auto_delivery: form.auto_delivery,
      stock: form.auto_delivery || form.stock.trim() === '' ? null : Math.max(0, Math.floor(Number(form.stock) || 0)),
    }
    await (editId ? api(`products?id=eq.${editId}`, { method: 'PATCH', body }) : api('products', { method: 'POST', body: { ...body, sort: d.products.length } }))
    setForm(f => ({ ...EMPTY, category: f.category })); setEditId(null)
  }, editId ? 'Perubahan produk disimpan' : 'Produk berhasil ditambahkan')
  const startEdit = (p: Row) => {
    setForm({ name: p.name, category: p.category, tagline: p.tagline ?? '', price: String(p.price), original_price: p.original_price ? String(p.original_price) : '', period: p.period ?? '', features: (p.features ?? []).join(', '), badge: p.badge ?? '', auto_delivery: Boolean(p.auto_delivery), stock: p.stock === null || p.stock === undefined ? '' : String(p.stock), popular: !!p.popular, logo_url: p.logo_url ?? '' })
    setEditId(p.id); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleLogoUpload(file: File) {
    if (file.size > MAX_LOGO_MB * 1024 * 1024) { setErr(`Ukuran logo maksimal ${MAX_LOGO_MB} MB`); return }
    setLogoUploading(true); setErr('')
    try {
      const ext = file.name.split('.').pop() || 'png'
      const url = await uploadFile('products', `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`, file)
      setForm(f => ({ ...f, logo_url: url }))
    } catch (e) { setErr('Gagal unggah logo: ' + (e as Error).message) } finally { setLogoUploading(false) }
  }

  const addCategory = () => run(async () => {
    const name = newCategory.trim()
    if (!name) return
    await api('categories', { method: 'POST', body: { name, sort: d.categories.length } })
    setNewCategory('')
  }, 'Kategori ditambahkan')
  const removeCategory = async (c: Row) => {
    if (await ask({ title: `Hapus kategori "${c.name}"?`, description: 'Produk di kategori ini tidak ikut terhapus.', confirmLabel: 'Hapus', danger: true }))
      run(() => api(`categories?id=eq.${c.id}`, { method: 'DELETE' }), 'Kategori dihapus')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard Admin" subtitle="Kelola pesanan, produk, top up, dan pengguna."
        leading={<div className="icon-tile hidden sm:inline-flex" style={{ width: 44, height: 44 }}><Icon name="shield" size={20} /></div>} />

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => goTab(id)} className={`chip ${tab === id ? 'chip-active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

      {!loaded && <div className="card overflow-hidden"><SkeletonRows rows={4} /></div>}

      {loaded && tab === 'ringkasan' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {([
            ['users', 'Pengguna', stats ? stats.users : '-'],
            ['clipboard', 'Pesanan', stats ? stats.orders : '-'],
            ['clock', 'Menunggu', stats ? stats.orders_pending + stats.topups_pending : '-'],
            ['wallet', 'Pendapatan', stats ? formatRp(stats.revenue) : '-'],
          ] as [IconName, string, string | number][]).map(([ic, label, val]) => (
            <div key={label} className="card card-interactive flex items-center gap-4 px-4 py-4 sm:px-5">
              <div className="icon-tile"><Icon name={ic} size={18} /></div>
              <div className="min-w-0">
                <p className="text-[13px] text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold text-white tracking-tight tabular truncate mt-0.5">{val}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && tab === 'ringkasan' && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['Sudah dikirim (aktif)', formatRp(stats.revenue_delivered)],
            ['Sudah dibayar, belum diproses', formatRp(stats.pending_value)],
            ['Total refund', formatRp(stats.refunded)],
          ] as [string, string][]).map(([label, val]) => (
            <div key={label} className="card-inset p-4">
              <p className="text-[12px] text-muted-foreground">{label}</p>
              <p className="text-base font-semibold text-white tabular mt-0.5">{val}</p>
            </div>
          ))}
        </div>
      )}

      {loaded && tab === 'ringkasan' && (
        <div className="card p-4 sm:p-5">
          <p className="section-title">Omzet 6 bulan terakhir</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">Semua pesanan yang tidak dibatalkan (waktu WIB)</p>
          <div className="flex items-end gap-2 h-36">
            {monthly.map(m => (
              <div key={m.label + m.total} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full min-w-0">
                <span className="text-[10px] text-muted-foreground tabular truncate max-w-full">{m.total > 0 ? formatRp(m.total) : ''}</span>
                <div className="w-full rounded-md" style={{ height: `${Math.max((m.total / monthlyMax) * 100, 3)}%`, background: 'linear-gradient(180deg, #4d8dff 0%, #2657c9 100%)', opacity: m.total > 0 ? 1 : 0.25 }} />
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loaded && tab === 'pesanan' && <AdminOrders slaHours={slaHours} lateCount={stats?.late ?? 0} onChanged={refreshAll} />}
      {loaded && tab === 'pengguna' && <AdminUsers onChanged={refreshAll} onMessage={u => { setMsgPrefill({ target: u.user_code ?? u.email ?? '', n: Date.now() }); setTab('pesan') }} />}
      {loaded && tab === 'topup' && <AdminTopups onChanged={refreshAll} />}

      {loaded && tab === 'produk' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 items-start">
            <div className="card p-4 sm:p-5 space-y-4">
              <div>
                <p className="section-title flex items-center gap-2"><Icon name="tag" size={16} className="text-muted-foreground" /> Kelola Kategori</p>
                <p className="hint mt-1">Kategori tampil sebagai filter di halaman Produk.</p>
              </div>
              <div className="flex gap-2">
                <input className={FIELD} style={FIELD_STYLE} placeholder="Nama kategori baru" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                <Btn onClick={addCategory} variant="secondary"><Icon name="plus" size={14} /> Tambah</Btn>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.categories.length === 0 && <p className="hint">Belum ada kategori. Tambahkan kategori dulu sebelum membuat produk.</p>}
                {d.categories.map(c => (
                  <span key={c.id} className="badge badge-neutral pr-1" style={{ height: 28 }}>
                    {c.name}
                    <button onClick={() => removeCategory(c)} className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors duration-200" aria-label={`Hapus ${c.name}`}><Icon name="x" size={12} /></button>
                  </span>
                ))}
              </div>
            </div>

            <div className="card p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="section-title">{editId ? 'Edit Produk' : 'Tambah Produk'}</p>
                {editId && <span className="badge badge-primary">Mode edit</span>}
              </div>
              <Field label="Nama produk"><input className={FIELD} style={FIELD_STYLE} placeholder="mis. VPS Starter" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kategori">
                  <select className={FIELD} style={FIELD_STYLE} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} disabled={categoryNames.length === 0}>
                    {categoryNames.length === 0 ? <option value="">Tambahkan kategori dulu</option> : categoryNames.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Periode"><input className={FIELD} style={FIELD_STYLE} placeholder="/bln" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Harga (Rp)"><input className={FIELD} style={FIELD_STYLE} placeholder="35000" inputMode="numeric" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
                <Field label="Harga coret (opsional)"><input className={FIELD} style={FIELD_STYLE} placeholder="50000" inputMode="numeric" value={form.original_price} onChange={e => setForm({ ...form, original_price: e.target.value })} /></Field>
              </div>
              <Field label="Deskripsi singkat"><input className={FIELD} style={FIELD_STYLE} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} /></Field>
              <Field label="Fitur (pisahkan dengan koma)"><input className={FIELD} style={FIELD_STYLE} placeholder="1 vCPU, 1 GB RAM, 20 GB SSD" value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} /></Field>
              <Field label={`Foto / logo produk (maks ${MAX_LOGO_MB} MB — dipakai sebagai thumbnail produk)`}>
                <div className="flex items-center gap-3">
                  <ProductThumb url={form.logo_url} size={40} />
                  <label className="flex-1 min-w-0">
                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                    <span className="input input-sm cursor-pointer flex items-center gap-2 text-slate-300"><Icon name="upload" size={14} /> <span className="truncate">{logoUploading ? 'Mengunggah...' : (form.logo_url ? 'Ganti foto' : 'Pilih foto produk')}</span></span>
                  </label>
                  {form.logo_url && <Btn onClick={() => setForm(f => ({ ...f, logo_url: '' }))} variant="ghost"><Icon name="x" size={14} /></Btn>}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label="Label (opsional)"><input className={FIELD} style={FIELD_STYLE} placeholder="Promo / Terlaris" value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })} /></Field>
                <label className="flex items-center gap-2.5 text-[13px] text-slate-200 h-9 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded accent-[#4f7cff]" checked={form.popular} onChange={e => setForm({ ...form, popular: e.target.checked })} /> Tandai populer
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <label className="flex items-center gap-2.5 text-[13px] text-slate-200 h-9 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded accent-[#4f7cff]" checked={form.auto_delivery} onChange={e => setForm({ ...form, auto_delivery: e.target.checked })} /> Kirim otomatis (dari stok)
                </label>
                {!form.auto_delivery && <Field label="Stok (kosong = tanpa batas)"><input className={FIELD} style={FIELD_STYLE} inputMode="numeric" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} /></Field>}
              </div>
              <div className="flex gap-2 justify-end pt-1">
                {editId && <Btn onClick={() => { setForm(f => ({ ...EMPTY, category: f.category })); setEditId(null) }} variant="ghost">Batal</Btn>}
                <Btn onClick={saveProduct} variant="primary"><Icon name={editId ? 'check' : 'plus'} size={14} strokeWidth={2.25} /> {editId ? 'Simpan Perubahan' : 'Tambah Produk'}</Btn>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="section-title">Daftar produk</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.products.length} produk</p>
              </div>
            </div>
            {d.products.length === 0 && <EmptyState icon="package" title="Belum ada produk." description="Tambahkan produk pertama lewat form di atas." />}
            <div className="divide-y divide-white/[0.06]">
              {d.products.map(p => (
                <div key={p.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <ProductThumb url={p.logo_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground tabular">{p.category} · {formatRp(p.price)}{p.period}</p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button onClick={() => run(() => api(`products?id=eq.${p.id}`, { method: 'PATCH', body: { active: !p.active } }))}
                      className={`badge badge-dot cursor-pointer transition-opacity duration-200 hover:opacity-80 ${p.active ? 'badge-success' : 'badge-neutral'}`} style={{ height: 32, padding: '0 12px' }}>
                      {p.active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <Btn onClick={() => startEdit(p)} variant="secondary"><Icon name="edit" size={14} /></Btn>
                    <Btn onClick={async () => { if (await ask({ title: `Hapus ${p.name}?`, description: 'Produk akan dihapus permanen dari katalog.', confirmLabel: 'Hapus', danger: true })) run(() => api(`products?id=eq.${p.id}`, { method: 'DELETE' }), 'Produk dihapus') }} variant="danger"><Icon name="trash" size={14} /></Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loaded && tab === 'pesan' && (users
        ? <AdminMessages users={users} prefill={msgPrefill} />
        : <div className="card overflow-hidden"><SkeletonRows rows={2} /></div>)}
      {loaded && tab === 'voucher' && <AdminVouchers />}
      {loaded && tab === 'stok' && <AdminStock products={d.products} />}
      {loaded && tab === 'bot' && <AdminBot />}
      {loaded && tab === 'audit' && <AdminAudit />}
      {loaded && tab === 'pengaturan' && <AdminSettings />}

    </div>
  )
}
