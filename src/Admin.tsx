import { useCallback, useEffect, useState } from 'react'
import { api, uploadFile, type Row } from './lib/supabase'
import { Icon, TONE, formatRp, ProductThumb, type IconName } from './ui'

const CARD = { background: '#171d36', border: '1px solid #2a3154' }
const MUTED = { color: '#8f9bbd' }
const FIELD = 'w-full text-white text-xs px-3 py-2.5 rounded-lg focus:outline-none'
const FIELD_STYLE = { background: '#0b0d18', border: '1px solid #2a3154' }
const TABS = [['ringkasan', 'Ringkasan'], ['pesanan', 'Pesanan'], ['produk', 'Produk'], ['topup', 'Top Up'], ['pengguna', 'Pengguna']] as const
const EMPTY = { name: '', category: '', tagline: '', price: '', original_price: '', period: '/bln', features: '', badge: '', popular: false, logo_url: '' }
const MAX_LOGO_MB = 10

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[10px] mb-1 block" style={MUTED}>{label}</span>{children}</label>
}

function Btn({ children, onClick, color = '#3d7ef5', disabled }: { children: React.ReactNode; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="px-3 py-2 rounded-lg text-[11px] font-display font-700 text-white flex items-center gap-1.5 hover:brightness-110 transition disabled:opacity-50" style={{ background: color }}>
      {children}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#03040a]/90 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto" style={CARD} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-display font-700 text-white text-sm">{title}</p>
          <button onClick={onClose} style={MUTED} className="w-8 h-8 rounded-full flex items-center justify-center hover:text-white transition-colors" aria-label="Tutup"><Icon name="x" size={16} /></button>
        </div>
        {children}
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
  const [ok, setOk] = useState('')
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
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<unknown>, msg?: string) => {
    try {
      await fn(); await load(); onChanged(); setErr('')
      if (msg) { setOk(msg); setTimeout(() => setOk(''), 3000) }
    } catch (e) { setErr((e as Error).message); setOk('') }
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
      setOk('ID pesanan disalin: ORD-' + id); setTimeout(() => setOk(''), 2000)
    } catch { setErr('Gagal menyalin ID pesanan') }
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
  const removeCategory = (c: Row) => confirm(`Hapus kategori "${c.name}"?`) && run(() => api(`categories?id=eq.${c.id}`, { method: 'DELETE' }))

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
    <div className="space-y-3.5">
      <h1 className="font-display font-800 text-2xl text-white flex items-center gap-2"><Icon name="shield" size={24} /> Dashboard Admin</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="px-4 py-2 rounded-full text-xs font-display font-700 whitespace-nowrap transition"
            style={{ background: tab === id ? '#3d7ef5' : '#171d36', color: tab === id ? '#fff' : '#8f9bbd', border: '1px solid #2a3154' }}>{label}</button>
        ))}
      </div>
      {ok && <p className="text-xs rounded-xl p-3" style={{ background: '#0f3320', color: '#4ade80' }}>{ok}</p>}
      {err && <p className="text-xs rounded-xl p-3" style={{ background: '#3b1219', color: '#fca5a5' }}>{err}</p>}

      {tab === 'ringkasan' && (
        <div className="grid grid-cols-2 gap-3">
          {([['users', 'Pengguna', d.users.length, TONE.blue], ['clipboard', 'Pesanan', d.orders.length, TONE.purple], ['refresh', 'Menunggu', pending, TONE.gold], ['wallet', 'Pendapatan', formatRp(revenue), TONE.green]] as [IconName, string, string | number, string][]).map(([ic, label, val, bg]) => (
            <div key={label} className="rounded-2xl p-4 flex flex-col gap-2" style={CARD}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: bg }}><Icon name={ic} size={20} /></div>
              <p className="font-display font-800 text-white text-lg leading-tight">{val}</p>
              <p className="text-[11px]" style={MUTED}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'pesanan' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-3.5 space-y-2" style={CARD}>
            <Field label="Cari ID pesanan (mis. ORD-12 atau 12), nama produk, atau email pembeli">
              <div className="relative">
                <input className={FIELD} style={{ ...FIELD_STYLE, paddingRight: '2.2rem' }} placeholder="mis. ORD-12" value={orderSearch} onChange={e => setOrderSearch(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2" style={MUTED}><Icon name="tag" size={14} /></span>
              </div>
            </Field>
            {oq && <p className="text-[11px]" style={MUTED}>{filteredOrders.length > 0 ? `Ditemukan ${filteredOrders.length} pesanan cocok.` : 'Tidak ada pesanan yang cocok.'}</p>}
          </div>
          {filteredOrders.length === 0 ? (
            <p className="text-xs text-center py-8" style={MUTED}>{oq ? 'Tidak ada pesanan yang cocok dengan pencarian.' : 'Belum ada pesanan.'}</p>
          ) : filteredOrders.map(o => (
            <div key={o.id} className="rounded-2xl p-3.5 space-y-2.5" style={CARD}>
              <div className="flex justify-between gap-2">
                <div className="min-w-0 flex items-center gap-2">
                  <ProductThumb url={o.logo_url} size={34} />
                  <div className="min-w-0">
                    <p className="font-display font-700 text-white text-sm truncate">{o.product_name}</p>
                    <p className="text-[10px] truncate" style={MUTED}>{who(o.user_id)}</p>
                  </div>
                </div>
                <p className="font-display font-800 text-white text-sm whitespace-nowrap">{formatRp(o.price)}</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={FIELD_STYLE}>
                <span className="text-[11px] font-display font-700 text-white flex-1 truncate">ORD-{o.id}</span>
                <button onClick={() => copyOrderId(o.id)} className="text-[10px] font-display font-700 px-2 py-1 rounded-md flex items-center gap-1 hover:brightness-110 transition" style={{ background: '#2a3154', color: '#8f9bbd' }} aria-label="Salin ID pesanan">
                  <Icon name="clipboard" size={12} /> Salin ID
                </button>
              </div>
              {(o.buyer_whatsapp || o.buyer_contact_email) && (
                <p className="text-[10px]" style={MUTED}>Kontak: {o.buyer_contact_email ?? '-'}{o.buyer_whatsapp ? ` · WA ${o.buyer_whatsapp}` : ''}</p>
              )}
              <select value={o.status} onChange={e => run(() => api(`orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: e.target.value } }))} className={FIELD} style={FIELD_STYLE}>
                <option value="pending">Menunggu konfirmasi</option><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option>
              </select>
              <Field label="Data akun / info penting (dikirim ke user)">
                <textarea className={FIELD} style={FIELD_STYLE} rows={2} placeholder="mis. IP: 1.2.3.4, user: root, pass: ****"
                  value={orderNotes[o.id] ?? o.account_data ?? ''} onChange={e => setOrderNotes(prev => ({ ...prev, [o.id]: e.target.value }))} />
              </Field>
              <Btn onClick={() => saveAccountData(o)} color="#2657c9"><Icon name="check" size={13} /> Simpan Data Akun</Btn>
            </div>
          ))}
        </div>
      )}

      {tab === 'produk' && (
        <>
          <div className="rounded-2xl p-3.5 space-y-2.5" style={CARD}>
            <p className="font-display font-700 text-white text-sm flex items-center gap-1.5"><Icon name="tag" size={14} /> Kelola Kategori</p>
            <div className="flex gap-2">
              <input className={FIELD} style={FIELD_STYLE} placeholder="Nama kategori baru" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
              <Btn onClick={addCategory} color="#15803d"><Icon name="plus" size={13} /></Btn>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {d.categories.length === 0 && <p className="text-[10px]" style={MUTED}>Belum ada kategori. Tambahkan kategori dulu sebelum membuat produk.</p>}
              {d.categories.map(c => (
                <span key={c.id} className="text-[10px] font-display font-700 pl-2.5 pr-1.5 py-1 rounded-full flex items-center gap-1" style={{ background: '#0b0d18', border: '1px solid #2a3154', color: '#8f9bbd' }}>
                  {c.name}
                  <button onClick={() => removeCategory(c)} className="w-4 h-4 rounded-full flex items-center justify-center hover:text-white" aria-label={`Hapus ${c.name}`}><Icon name="x" size={10} /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-3.5 space-y-2.5" style={CARD}>
            <p className="font-display font-700 text-white text-sm">{editId ? 'Edit Produk' : 'Tambah Produk'}</p>
            <Field label="Nama produk"><input className={FIELD} style={FIELD_STYLE} placeholder="mis. VPS Starter" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Kategori">
                <select className={FIELD} style={FIELD_STYLE} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} disabled={categoryNames.length === 0}>
                  {categoryNames.length === 0 ? <option value="">Tambahkan kategori dulu</option> : categoryNames.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Periode"><input className={FIELD} style={FIELD_STYLE} placeholder="/bln" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Harga (Rp)"><input className={FIELD} style={FIELD_STYLE} placeholder="35000" inputMode="numeric" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></Field>
              <Field label="Harga coret (opsional)"><input className={FIELD} style={FIELD_STYLE} placeholder="50000" inputMode="numeric" value={form.original_price} onChange={e => setForm({ ...form, original_price: e.target.value })} /></Field>
            </div>
            <Field label="Deskripsi singkat"><input className={FIELD} style={FIELD_STYLE} value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} /></Field>
            <Field label="Fitur (pisahkan dengan koma)"><input className={FIELD} style={FIELD_STYLE} placeholder="1 vCPU, 1 GB RAM, 20 GB SSD" value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} /></Field>
            <Field label={`Foto / logo produk (maks ${MAX_LOGO_MB} MB — dipakai sebagai thumbnail produk)`}>
              <div className="flex items-end gap-2">
                <ProductThumb url={form.logo_url} size={40} />
                <label className="flex-1">
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                  <span className={FIELD + ' cursor-pointer flex items-center gap-1.5'} style={FIELD_STYLE}><Icon name="upload" size={13} /> {logoUploading ? 'Mengunggah...' : (form.logo_url ? 'Ganti foto' : 'Pilih foto produk')}</span>
                </label>
                {form.logo_url && <Btn onClick={() => setForm(f => ({ ...f, logo_url: '' }))} color="#4b5378"><Icon name="x" size={13} /></Btn>}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2 items-end">
              <Field label="Label (opsional)"><input className={FIELD} style={FIELD_STYLE} placeholder="Promo / Terlaris" value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-xs text-white pb-2.5"><input type="checkbox" checked={form.popular} onChange={e => setForm({ ...form, popular: e.target.checked })} /> Tandai populer</label>
            </div>
            <div className="flex gap-2">
              <Btn onClick={saveProduct}><Icon name={editId ? 'check' : 'plus'} size={14} strokeWidth={2.5} /> {editId ? 'Simpan Perubahan' : 'Tambah Produk'}</Btn>
              {editId && <Btn onClick={() => { setForm(f => ({ ...EMPTY, category: f.category })); setEditId(null) }} color="#4b5378">Batal</Btn>}
            </div>
          </div>
          {d.products.length === 0 && <p className="text-xs text-center py-4" style={MUTED}>Belum ada produk. Tambahkan produk pertama lewat form di atas.</p>}
          {d.products.map(p => (
            <div key={p.id} className="rounded-2xl p-3 flex items-center gap-3" style={CARD}>
              <ProductThumb url={p.logo_url} size={40} />
              <div className="min-w-0 flex-1"><p className="font-display font-700 text-white text-sm truncate">{p.name}</p><p className="text-[10px]" style={MUTED}>{p.category} · {formatRp(p.price)}{p.period}</p></div>
              <Btn onClick={() => startEdit(p)} color="#2657c9"><Icon name="edit" size={14} /></Btn>
              <Btn onClick={() => run(() => api(`products?id=eq.${p.id}`, { method: 'PATCH', body: { active: !p.active } }))} color={p.active ? '#15803d' : '#4b5378'}>{p.active ? 'Aktif' : 'Nonaktif'}</Btn>
              <Btn onClick={() => confirm(`Hapus ${p.name}?`) && run(() => api(`products?id=eq.${p.id}`, { method: 'DELETE' }))} color="#b91c1c"><Icon name="trash" size={14} /></Btn>
            </div>
          ))}
        </>
      )}

      {tab === 'pengguna' && (() => {
        const q = emailSearch.trim().toLowerCase()
        const filtered = q ? d.users.filter(u => (u.email ?? '').toLowerCase().includes(q)) : d.users
        return (
          <div className="space-y-3.5">
            <div className="rounded-2xl p-3.5 space-y-2.5" style={CARD}>
              <Field label="Cek email pengguna">
                <input className={FIELD} style={FIELD_STYLE} placeholder="mis. nama@gmail.com" value={emailSearch} onChange={e => setEmailSearch(e.target.value)} />
              </Field>
              {q && <p className="text-[11px]" style={MUTED}>{filtered.length > 0 ? `Ditemukan ${filtered.length} email cocok.` : 'Email tidak terdaftar.'}</p>}
            </div>
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-8" style={MUTED}>{q ? `Tidak ada pengguna dengan email mengandung "${emailSearch}"` : 'Belum ada pengguna.'}</p>
            ) : filtered.map(u => (
              <div key={u.id} className="rounded-2xl p-3 flex items-center gap-3" style={CARD}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: TONE.blue }}><Icon name="mail" size={16} /></div>
                <div className="min-w-0 flex-1"><p className="font-display font-700 text-white text-xs truncate">{u.email ?? '(tanpa email)'}</p></div>
                <Btn onClick={() => setDetailUser(u)} color="#2657c9"><Icon name="eye" size={13} /> Detail</Btn>
              </div>
            ))}
          </div>
        )
      })()}

      {tab === 'topup' && (d.topups.length === 0 ? <p className="text-xs text-center py-8" style={MUTED}>Belum ada permintaan top up.</p> : d.topups.map(t => (
        <div key={t.id} className="rounded-2xl p-3.5 flex items-center gap-3" style={CARD}>
          <div className="min-w-0 flex-1"><p className="font-display font-800 text-white text-sm">{formatRp(t.amount)}</p><p className="text-[10px] truncate" style={MUTED}>{who(t.user_id)} · {t.status}</p></div>
          {t.status === 'pending' && <>
            <Btn onClick={() => run(() => api('rpc/approve_topup', { method: 'POST', body: { tid: t.id } }))} color="#15803d"><Icon name="check" size={14} strokeWidth={3} /> Setujui</Btn>
            <Btn onClick={() => run(() => api(`topups?id=eq.${t.id}`, { method: 'PATCH', body: { status: 'rejected' } }))} color="#b91c1c"><Icon name="x" size={14} /></Btn>
          </>}
        </div>
      )))}

      {detailUser && (
        <Modal title="Detail Pengguna" onClose={() => { setDetailUser(null); setSaldoAmount('') }}>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: TONE.blue }}><Icon name="mail" size={20} /></div>
            <div className="min-w-0">
              <p className="font-display font-700 text-white text-sm truncate">{detailUser.email ?? '(tanpa email)'}</p>
              <p className="text-[10px]" style={MUTED}>{detailUser.full_name ?? 'Tanpa nama'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-2.5" style={FIELD_STYLE}><p className="text-[9px] uppercase tracking-widest" style={MUTED}>Bergabung</p><p className="text-xs text-white font-display font-700">{new Date(detailUser.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>
            <div className="rounded-xl p-2.5" style={FIELD_STYLE}><p className="text-[9px] uppercase tracking-widest" style={MUTED}>Saldo sekarang</p><p className="text-xs text-white font-display font-700">{formatRp(detailUser.saldo ?? 0)}</p></div>
            <div className="rounded-xl p-2.5 col-span-2" style={FIELD_STYLE}><p className="text-[9px] uppercase tracking-widest" style={MUTED}>Nomor HP / WhatsApp</p><p className="text-xs text-white font-display font-700">{detailUser.whatsapp || '-'}</p></div>
          </div>
          <Field label="Nominal (Rp)">
            <input className={FIELD} style={FIELD_STYLE} inputMode="numeric" placeholder="mis. 50000" value={saldoAmount} onChange={e => setSaldoAmount(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Btn onClick={() => adjustSaldo(Number(saldoAmount.replace(/\D/g, '')))} color="#15803d" disabled={!saldoAmount}><Icon name="plus" size={13} /> Tambah Saldo</Btn>
            <Btn onClick={() => adjustSaldo(-Number(saldoAmount.replace(/\D/g, '')))} color="#b45309" disabled={!saldoAmount}><Icon name="wallet" size={13} /> Refund / Kembalikan</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
