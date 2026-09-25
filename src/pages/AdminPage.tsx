import { useCallback, useEffect, useState } from 'react'
import { api, uploadFile, type Row } from '../lib/supabase'
import { Icon, formatRp, ProductThumb, PageHeader, EmptyState, StatusBadge, SkeletonRows, type IconName } from '../ui'
import { useConfirm, useToast } from '../feedback'

const MUTED = { color: '#94a3b8' }
const FIELD = 'input input-sm'
const FIELD_STYLE = {} as React.CSSProperties
const TABS = [['ringkasan', 'Ringkasan'], ['pesanan', 'Pesanan'], ['produk', 'Produk'], ['topup', 'Top Up'], ['pengguna', 'Pengguna']] as const
const EMPTY = { name: '', category: '', tagline: '', price: '', original_price: '', period: '/bln', features: '', badge: '', popular: false, logo_url: '' }
const MAX_LOGO_MB = 10

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[12px] font-medium text-slate-300 mb-1.5 block">{label}</span>{children}</label>
}

type BtnVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost'

// `color` dipertahankan untuk kompatibilitas; dipetakan ke varian tombol netral.
const COLOR_VARIANT: Record<string, BtnVariant> = {
  '#3d7ef5': 'primary', '#2657c9': 'secondary', '#15803d': 'success', '#b91c1c': 'danger', '#b45309': 'warning', '#4b5378': 'ghost',
}

function Btn({ children, onClick, color = '#3d7ef5', variant, disabled }: { children: React.ReactNode; onClick: () => void; color?: string; variant?: BtnVariant; disabled?: boolean }) {
  const v = variant ?? COLOR_VARIANT[color] ?? 'primary'
  const cls = v === 'ghost' ? 'btn-secondary' : `btn-${v}`
  return (
    <button onClick={onClick} disabled={disabled} className={`btn btn-sm ${cls}`}>
      {children}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-semibold text-white">{title}</p>
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Tutup"><Icon name="x" size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  )
}

export default function AdminPage({ onChanged }: { onChanged: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('ringkasan')
  const [d, setD] = useState<{ orders: Row[]; products: Row[]; topups: Row[]; users: Row[]; categories: Row[] }>({ orders: [], products: [], topups: [], users: [], categories: [] })
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const toast = useToast()
  const ask = useConfirm()
  const [loaded, setLoaded] = useState(false)
  const [emailSearch, setEmailSearch] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [detailUser, setDetailUser] = useState<Row | null>(null)
  const [saldoAmount, setSaldoAmount] = useState('')
  const [orderNotes, setOrderNotes] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    try {
      const [orders, products, topups, users, categories] = await Promise.all([
        api('orders?select=*&order=id.desc'), api('products?select=*&order=sort,id'),
        api('topups?select=*&order=id.desc'), api('profiles?select=*&order=created_at.desc'),
        api('categories?select=*&order=sort,id'),
      ])
      setD({ orders, products, topups, users, categories }); setErr('')
    } catch (e) { setErr((e as Error).message) } finally { setLoaded(true) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn(); await load(); onChanged(); setErr('')
      if (msg) toast(msg)
    } catch (e) { setErr((e as Error).message) }
  }
  const who = (uid: string) => d.users.find(u => u.id === uid)?.email ?? uid.slice(0, 8)
  const pending = d.orders.filter(o => o.status === 'pending').length + d.topups.filter(t => t.status === 'pending').length
  const revenue = d.orders.filter(o => o.status === 'aktif').reduce((s, o) => s + Number(o.price), 0)
  const categoryNames = d.categories.map(c => c.name)

  // Kategori baru bisa langsung dipakai; jaga supaya form selalu punya kategori aktif yang valid.
  useEffect(() => {
    if (categoryNames.length && !categoryNames.includes(form.category)) {
      setForm(f => ({ ...f, category: categoryNames[0] }))
    }
  }, [d.categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyOrderId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(`ORD-${id}`)
      toast('ID pesanan disalin: ORD-' + id)
    } catch { toast('Gagal menyalin ID pesanan', 'error') }
  }

  const oq = orderSearch.trim().toLowerCase()
  const filteredOrders = !oq ? d.orders : d.orders.filter(o =>
    `ord-${o.id}`.includes(oq) || String(o.id).includes(oq) ||
    (o.product_name ?? '').toLowerCase().includes(oq) || who(o.user_id).toLowerCase().includes(oq)
  )

  const saveProduct = () => run(async () => {
    if (!form.name.trim() || !Number(form.price)) throw new Error('Nama dan harga wajib diisi')
    if (!form.category) throw new Error('Tambahkan kategori dulu di Kelola Kategori')
    const body = {
      name: form.name.trim(), category: form.category, tagline: form.tagline, price: Number(form.price),
      original_price: Number(form.original_price) || null, period: form.period,
      features: form.features.split(',').map(s => s.trim()).filter(Boolean),
      badge: form.badge.trim() || null, popular: form.popular,
      logo_url: form.logo_url || null,
    }
    await (editId ? api(`products?id=eq.${editId}`, { method: 'PATCH', body }) : api('products', { method: 'POST', body: { ...body, sort: d.products.length } }))
    setForm(f => ({ ...EMPTY, category: f.category })); setEditId(null)
  }, editId ? 'Perubahan produk disimpan' : 'Produk berhasil ditambahkan')
  const startEdit = (p: Row) => {
    setForm({ name: p.name, category: p.category, tagline: p.tagline ?? '', price: String(p.price), original_price: p.original_price ? String(p.original_price) : '', period: p.period ?? '', features: (p.features ?? []).join(', '), badge: p.badge ?? '', popular: !!p.popular, logo_url: p.logo_url ?? '' })
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

  const saveAccountData = (o: Row) => run(() => api(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { account_data: orderNotes[o.id] ?? o.account_data ?? '' } }), 'Data akun disimpan')

  const adjustSaldo = (delta: number) => {
    if (!detailUser || !delta) return
    run(() => api('rpc/admin_adjust_saldo', { method: 'POST', body: { target_uid: detailUser.id, delta } }),
      delta > 0 ? 'Saldo berhasil ditambahkan' : 'Saldo berhasil dikembalikan').then(() => {
      setSaldoAmount('')
      setDetailUser(u => u ? { ...u, saldo: Math.max(0, Number(u.saldo ?? 0) + delta) } : u)
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard Admin" subtitle="Kelola pesanan, produk, top up, dan pengguna."
        leading={<div className="icon-tile hidden sm:inline-flex" style={{ width: 44, height: 44 }}><Icon name="shield" size={20} /></div>} />

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
        <div className="inline-flex gap-1 p-1 rounded-[14px] bg-[#111827]" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`chip ${tab === id ? 'chip-active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>
      {err && <div className="alert alert-danger"><Icon name="info" size={16} className="mt-0.5" /><span>{err}</span></div>}

      {!loaded && <div className="card overflow-hidden"><SkeletonRows rows={4} /></div>}

      {loaded && tab === 'ringkasan' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {([['users', 'Pengguna', d.users.length], ['clipboard', 'Pesanan', d.orders.length], ['clock', 'Menunggu', pending], ['wallet', 'Pendapatan', formatRp(revenue)]] as [IconName, string, string | number][]).map(([ic, label, val]) => (
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

      {loaded && tab === 'pesanan' && (
        <div className="space-y-4">
          <div className="card p-4 sm:p-5 space-y-2">
            <Field label="Cari ID pesanan (mis. ORD-12 atau 12), nama produk, atau email pembeli">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={MUTED}><Icon name="search" size={16} /></span>
                <input className="input" style={{ paddingLeft: 40 }} placeholder="mis. ORD-12" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
              </div>
            </Field>
            {oq && <p className="hint">{filteredOrders.length > 0 ? `Ditemukan ${filteredOrders.length} pesanan cocok.` : 'Tidak ada pesanan yang cocok.'}</p>}
          </div>
          {filteredOrders.length === 0 ? (
            <div className="card"><EmptyState icon="clipboard" title={oq ? 'Tidak ada pesanan yang cocok dengan pencarian.' : 'Belum ada pesanan.'} /></div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
              {filteredOrders.map(o => (
                <div key={o.id} className="card p-4 sm:p-5 space-y-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <ProductThumb url={o.logo_url} size={40} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{o.product_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{who(o.user_id)}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white tabular whitespace-nowrap">{formatRp(o.price)}</p>
                      <div className="mt-1"><StatusBadge status={o.status} /></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 card-inset pl-3.5 pr-1.5 py-1.5">
                    <span className="text-[13px] font-medium text-white flex-1 truncate font-mono">ORD-{o.id}</span>
                    <button onClick={() => copyOrderId(o.id)} className="btn btn-ghost btn-sm" aria-label="Salin ID pesanan">
                      <Icon name="copy" size={14} /> Salin ID
                    </button>
                  </div>
                  {(o.buyer_whatsapp || o.buyer_contact_email) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon name="mail" size={13} /> Kontak: {o.buyer_contact_email ?? '-'}{o.buyer_whatsapp ? ` · WA ${o.buyer_whatsapp}` : ''}</p>
                  )}
                  <Field label="Status">
                    <select value={o.status} onChange={e => run(() => api(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: e.target.value } }))} className={FIELD} style={FIELD_STYLE}>
                      <option value="pending">Menunggu konfirmasi</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
                    </select>
                  </Field>
                  <Field label="Data akun / info penting (dikirim ke user)">
                    <textarea className="input" rows={2} placeholder="mis. IP: 1.2.3.4, user: root, pass: ****"
                      value={orderNotes[o.id] ?? o.account_data ?? ''} onChange={e => setOrderNotes(prev => ({ ...prev, [o.id]: e.target.value }))} />
                  </Field>
                  <div className="flex justify-end">
                    <Btn onClick={() => saveAccountData(o)} variant="primary"><Icon name="check" size={14} /> Simpan Data Akun</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
              <div className="flex gap-2 justify-end pt-1">
                {editId && <Btn onClick={() => { setForm(f => ({ ...EMPTY, category: f.category })); setEditId(null) }} variant="ghost">Batal</Btn>}
                <Btn onClick={saveProduct} variant="primary"><Icon name={editId ? 'check' : 'plus'} size={14} strokeWidth={2.25} /> {editId ? 'Simpan Perubahan' : 'Tambah Produk'}</Btn>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 sm:px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="section-title">Daftar produk</p>
              <p className="text-xs text-muted-foreground mt-0.5">{d.products.length} produk</p>
            </div>
            {d.products.length === 0 && <EmptyState icon="package" title="Belum ada produk." description="Tambahkan produk pertama lewat form di atas." />}
            <div className="divide-y divide-white/[0.06]">
              {d.products.map(p => (
                <div key={p.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <ProductThumb url={p.logo_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
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

      {loaded && tab === 'pengguna' && (() => {
        const q = emailSearch.trim().toLowerCase()
        const filtered = q ? d.users.filter(u => (u.email ?? '').toLowerCase().includes(q)) : d.users
        return (
          <div className="space-y-4">
            <div className="card p-4 sm:p-5 space-y-2">
              <Field label="Cek email pengguna">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={MUTED}><Icon name="search" size={16} /></span>
                  <input className="input" style={{ paddingLeft: 40 }} placeholder="mis. nama@gmail.com" value={emailSearch} onChange={e => setEmailSearch(e.target.value)} />
                </div>
              </Field>
              {q && <p className="hint">{filtered.length > 0 ? `Ditemukan ${filtered.length} email cocok.` : 'Email tidak terdaftar.'}</p>}
            </div>
            <div className="card overflow-hidden">
              {filtered.length === 0 ? (
                <EmptyState icon="users" title={q ? `Tidak ada pengguna dengan email mengandung "${emailSearch}"` : 'Belum ada pengguna.'} />
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filtered.map(u => (
                    <div key={u.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 transition-colors duration-200 hover:bg-white/[0.02]">
                      <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="mail" size={16} /></div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-white truncate">{u.email ?? '(tanpa email)'}</p></div>
                      <Btn onClick={() => setDetailUser(u)} variant="secondary"><Icon name="eye" size={14} /> Detail</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {loaded && tab === 'topup' && (
        <div className="card overflow-hidden">
          {d.topups.length === 0 ? <EmptyState icon="wallet" title="Belum ada permintaan top up." /> : (
            <div className="divide-y divide-white/[0.06]">
              {d.topups.map(t => (
                <div key={t.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap sm:flex-nowrap">
                  <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="wallet" size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white tabular">{formatRp(t.amount)}</p>
                    <p className="text-xs text-muted-foreground truncate">{who(t.user_id)}</p>
                  </div>
                  <StatusBadge status={t.status} />
                  {t.status === 'pending' && <div className="flex gap-1.5 ml-auto">
                    <Btn onClick={() => run(() => api('rpc/approve_topup', { method: 'POST', body: { tid: t.id } }))} variant="success"><Icon name="check" size={14} strokeWidth={2.5} /> Setujui</Btn>
                    <Btn onClick={() => run(() => api(`topups?id=eq.${t.id}`, { method: 'PATCH', body: { status: 'rejected' } }))} variant="danger"><Icon name="x" size={14} /></Btn>
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {detailUser && (
        <Modal title="Detail Pengguna" onClose={() => { setDetailUser(null); setSaldoAmount('') }}>
          <div className="flex items-center gap-3">
            <div className="icon-tile" style={{ width: 44, height: 44 }}><Icon name="mail" size={18} /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{detailUser.email ?? '(tanpa email)'}</p>
              <p className="text-xs text-muted-foreground">{detailUser.full_name ?? 'Tanpa nama'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="card-inset p-3"><p className="text-[11px] text-muted-foreground">Bergabung</p><p className="text-[13px] text-white font-medium mt-0.5">{new Date(detailUser.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            <div className="card-inset p-3"><p className="text-[11px] text-muted-foreground">Saldo sekarang</p><p className="text-[13px] text-white font-medium tabular mt-0.5">{formatRp(detailUser.saldo ?? 0)}</p></div>
            <div className="card-inset p-3 col-span-2"><p className="text-[11px] text-muted-foreground">Nomor HP / WhatsApp</p><p className="text-[13px] text-white font-medium mt-0.5">{detailUser.whatsapp || '-'}</p></div>
          </div>
          <Field label="Nominal (Rp)">
            <input className="input" inputMode="numeric" placeholder="mis. 50000" value={saldoAmount} onChange={e => setSaldoAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => adjustSaldo(Number(saldoAmount.replace(/\D/g, '')))} disabled={!saldoAmount} className="btn btn-primary"><Icon name="plus" size={15} /> Tambah Saldo</button>
            <button onClick={() => adjustSaldo(-Number(saldoAmount.replace(/\D/g, '')))} disabled={!saldoAmount} className="btn btn-secondary"><Icon name="wallet" size={15} /> Refund / Kembalikan</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
