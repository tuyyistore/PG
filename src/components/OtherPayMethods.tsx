import { useEffect, useState } from 'react'
import { api, type Row } from '../lib/supabase'
import { Icon } from '../ui'
import { useToast } from '../feedback'
import { PayLogo } from './PayLogo'

/** Metode pembayaran lain di bawah QRIS. Data dari tabel payment_methods (diatur di Admin → Metode Bayar). */
export function OtherPayMethods() {
  const toast = useToast()
  const [methods, setMethods] = useState<Row[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    api('payment_methods?select=id,name,account_number,account_name,logo_url&active=eq.true&order=sort,id')
      .then(rows => setMethods(rows.filter((m: Row) => String(m.account_number ?? '').trim() !== '')))
      .catch(() => setMethods([]))
  }, [])

  if (methods.length === 0) return null

  async function copy(m: Row) {
    try {
      await navigator.clipboard.writeText(String(m.account_number).trim())
      toast(`Nomor ${m.name} disalin`)
    } catch { toast('Gagal menyalin, salin nomornya secara manual.', 'error') }
  }

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 text-left">
        <div className="min-w-0">
          <h2 className="section-title">Metode lain</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{methods.map(m => m.name).join(', ')}</p>
        </div>
        <span className="inline-flex flex-shrink-0 text-slate-400 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
          <Icon name="chevronDown" size={20} />
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="divide-y divide-white/[0.06]">
            {methods.map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
                <PayLogo url={m.logo_url} name={m.name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{m.name}</p>
                  <p className="text-sm text-slate-200 tabular tracking-wide break-all">{m.account_number}</p>
                  {m.account_name && <p className="text-xs text-muted-foreground truncate">a.n. {m.account_name}</p>}
                </div>
                <button type="button" onClick={() => copy(m)} className="btn btn-secondary btn-sm flex-shrink-0" aria-label={`Salin nomor ${m.name}`}>
                  <Icon name="copy" size={14} /> Salin
                </button>
              </div>
            ))}
          </div>
          <p className="hint px-4 sm:px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            Setelah transfer, kirim bukti pembayaran lewat tombol chat (ikon headset di pojok kanan bawah) agar admin menambahkan saldomu.
          </p>
        </div>
      )}
    </div>
  )
}
