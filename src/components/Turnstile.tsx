import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id?: string) => void
    }
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => { loading = null; reject(new Error('Gagal memuat captcha')) }
    document.head.appendChild(s)
  })
  return loading
}

export function Turnstile({ siteKey, onToken, resetKey }: { siteKey: string; onToken: (t: string) => void; resetKey: number }) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    let dead = false
    loadScript().then(() => {
      if (dead || !box.current || !window.turnstile) return
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(''),
        'error-callback': () => cb.current(''),
      })
    }).catch(() => {})
    return () => {
      dead = true
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current)
      widget.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) { cb.current(''); window.turnstile.reset(widget.current) }
  }, [resetKey])

  return <div ref={box} className="flex justify-center min-h-[65px]" />
}
