// Toast & dialog konfirmasi — pengganti pesan inline sementara dan window.confirm().
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './ui'

// ─── Suara notifikasi berhasil ─────────────────────────────────────────────────
// Dibuat langsung lewat Web Audio API (2 nada naik, seperti "ting-ting" khas notifikasi
// sukses) — tidak perlu file audio eksternal, jadi tidak akan gagal build/hilang saat deploy.

export function playSuccessSound() {
  try {
    type AudioCtor = typeof AudioContext
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
    const AudioCtx = w.AudioContext || w.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const notes = [880, 1318.51] // A5 → E6, interval naik yang terdengar "berhasil"
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.28, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.34)
    })
    setTimeout(() => ctx.close(), 700)
  } catch { /* abaikan bila audio diblokir/tidak didukung browser */ }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; text: string }

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {})

export const useToast = () => useContext(ToastCtx)

const TOAST_STYLE: Record<ToastKind, { icon: 'circleCheck' | 'info'; color: string }> = {
  success: { icon: 'circleCheck', color: '#4ade80' },
  error: { icon: 'info', color: '#f87171' },
  info: { icon: 'info', color: '#8fb0ff' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setItems(list => list.filter(t => t.id !== id)), [])
  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++seq.current
    setItems(list => [...list.slice(-2), { id, kind, text }])
    setTimeout(() => dismiss(id), kind === 'error' ? 5000 : 3000)
  }, [dismiss])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] top-4 left-4 right-4 sm:left-auto sm:right-6 sm:top-20 sm:w-[360px] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {items.map(t => (
          <div key={t.id} role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-[14px] px-4 py-3 text-sm text-slate-100"
            style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6)', animation: 'dialog-in 200ms' }}>
            <Icon name={TOAST_STYLE[t.kind].icon} size={18} className="mt-px flex-shrink-0" style={{ color: TOAST_STYLE[t.kind].color }} />
            <span className="flex-1 leading-5">{t.text}</span>
            <button onClick={() => dismiss(t.id)} className="text-slate-500 hover:text-white transition-colors duration-200 -mr-1" aria-label="Tutup"><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

type ConfirmOpts = { title: string; description?: string; confirmLabel?: string; danger?: boolean }
type Pending = ConfirmOpts & { resolve: (ok: boolean) => void }

const ConfirmCtx = createContext<(opts: ConfirmOpts) => Promise<boolean>>(async () => false)

/** `const ask = useConfirm(); if (await ask({ title: 'Hapus?' })) ...` */
export const useConfirm = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const ask = useCallback((opts: ConfirmOpts) => new Promise<boolean>(resolve => setPending({ ...opts, resolve })), [])
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null) }

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {pending && (
        <div className="overlay" onClick={() => close(false)}>
          <div className="dialog p-5 sm:p-6" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-4">
              <div className="icon-tile" style={pending.danger ? { color: '#f87171', background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.18)' } : undefined}>
                <Icon name={pending.danger ? 'trash' : 'info'} size={18} />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-[15px] font-semibold text-white">{pending.title}</p>
                {pending.description && <p className="hint mt-1">{pending.description}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:justify-end gap-2 mt-6">
              <button onClick={() => close(false)} className="btn btn-secondary">Batal</button>
              <button onClick={() => close(true)} autoFocus className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`}
                style={pending.danger ? { background: '#ef4444', color: '#fff', borderColor: '#ef4444' } : undefined}>
                {pending.confirmLabel ?? 'Ya, lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  )
}
