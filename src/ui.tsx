import { useRef, useState, type ReactNode } from 'react'
import type React from 'react'

// ─── Icons (inline SVG, gaya Lucide — tanpa dependensi tambahan) ──────────────

export const ICON_PATHS = {
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>,
  building: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4M10 10h4M10 14h4M10 18h4" /></>,
  gem: <><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></>,
  monitor: <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  settings: <><path transform="translate(12 12) scale(0.02232) translate(-512.0000 -512.0000)" d="M600.704 64a32 32 0 0 1 30.464 22.208l35.2 109.376c14.784 7.232 28.928 15.36 42.432 24.512l112.384-24.192a32 32 0 0 1 34.432 15.36L944.32 364.8a32 32 0 0 1-4.032 37.504l-77.12 85.12a357.12 357.12 0 0 1 0 49.024l77.12 85.248a32 32 0 0 1 4.032 37.504l-88.704 153.6a32 32 0 0 1-34.432 15.296L708.8 803.904c-13.44 9.088-27.648 17.28-42.368 24.512l-35.264 109.376A32 32 0 0 1 600.704 960H423.296a32 32 0 0 1-30.464-22.208L357.696 828.48a351.616 351.616 0 0 1-42.56-24.64l-112.32 24.256a32 32 0 0 1-34.432-15.36L79.68 659.2a32 32 0 0 1 4.032-37.504l77.12-85.248a357.12 357.12 0 0 1 0-48.896l-77.12-85.248A32 32 0 0 1 79.68 364.8l88.704-153.6a32 32 0 0 1 34.432-15.296l112.32 24.256c13.568-9.152 27.776-17.408 42.56-24.64l35.2-109.312A32 32 0 0 1 423.232 64H600.64zm-23.424 64H446.72l-36.352 113.088-24.512 11.968a294.113 294.113 0 0 0-34.816 20.096l-22.656 15.36-116.224-25.088-65.28 113.152 79.68 88.192-1.92 27.136a293.12 293.12 0 0 0 0 40.192l1.92 27.136-79.808 88.192 65.344 113.152 116.224-25.024 22.656 15.296a294.113 294.113 0 0 0 34.816 20.096l24.512 11.968L446.72 896h130.688l36.48-113.152 24.448-11.904a288.282 288.282 0 0 0 34.752-20.096l22.592-15.296 116.288 25.024 65.28-113.152-79.744-88.192 1.92-27.136a293.12 293.12 0 0 0 0-40.256l-1.92-27.136 79.808-88.128-65.344-113.152-116.288 24.96-22.592-15.232a287.616 287.616 0 0 0-34.752-20.096l-24.448-11.904L577.344 128zM512 320a192 192 0 1 1 0 384 192 192 0 0 1 0-384zm0 64a128 128 0 1 0 0 256 128 128 0 0 0 0-256z" /></>,
  infinity: <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  check: <polyline points="20 6 9 17 4 12" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M5 12h14M12 5v14" />,
  package: <><path transform="translate(12 12) scale(1.11111) translate(-10.0000 -10.0000)" d="M17 8h1v11H2V8h1V6c0-2.76 2.24-5 5-5 .71 0 1.39.15 2 .42.61-.27 1.29-.42 2-.42 2.76 0 5 2.24 5 5v2zM5 6v2h2V6c0-1.13.39-2.16 1.02-3H8C6.35 3 5 4.35 5 6zm10 2V6c0-1.65-1.35-3-3-3h-.02c.63.84 1.02 1.87 1.02 3v2h2zm-5-4.22C9.39 4.33 9 5.12 9 6v2h2V6c0-.88-.39-1.67-1-2.22z" /></>,
  clipboard: <><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" /></>,
  card: <><path transform="translate(12 12) scale(1.00000) translate(-12.0000 -12.0000)" d="M4,5A1,1,0,0,0,5,6H21a1,1,0,0,1,1,1V21a1,1,0,0,1-1,1H16a1,1,0,0,1,0-2h4V8H5a2.966,2.966,0,0,1-1-.184V19a1,1,0,0,0,1,1h5a1,1,0,0,0,1-1V14.414L9.707,15.707a1,1,0,0,1-1.414-1.414l3-3a.99.99,0,0,1,.326-.217,1,1,0,0,1,.764,0,.99.99,0,0,1,.326.217l3,3a1,1,0,0,1-1.414,1.414L13,14.414V19a3,3,0,0,1-3,3H5a3,3,0,0,1-3-3V5A3,3,0,0,1,5,2H21a1,1,0,0,1,0,2H5A1,1,0,0,0,4,5Z" /></>,
  wallet: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
  message: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><path d="M21 12H9" /></>,
  dashboard: <g transform="translate(12 12) scale(1.21203) translate(-12.5000 -11.5006)" fill="none" stroke="currentColor" strokeWidth={1.5}><path fillRule="evenodd" clipRule="evenodd" d="M9.918 10.0005H7.082C6.66587 9.99708 6.26541 10.1591 5.96873 10.4509C5.67204 10.7427 5.50343 11.1404 5.5 11.5565V17.4455C5.5077 18.3117 6.21584 19.0078 7.082 19.0005H9.918C10.3341 19.004 10.7346 18.842 11.0313 18.5502C11.328 18.2584 11.4966 17.8607 11.5 17.4445V11.5565C11.4966 11.1404 11.328 10.7427 11.0313 10.4509C10.7346 10.1591 10.3341 9.99708 9.918 10.0005Z" /><path fillRule="evenodd" clipRule="evenodd" d="M9.918 4.0006H7.082C6.23326 3.97706 5.52559 4.64492 5.5 5.4936V6.5076C5.52559 7.35629 6.23326 8.02415 7.082 8.0006H9.918C10.7667 8.02415 11.4744 7.35629 11.5 6.5076V5.4936C11.4744 4.64492 10.7667 3.97706 9.918 4.0006Z" /><path fillRule="evenodd" clipRule="evenodd" d="M15.082 13.0007H17.917C18.3333 13.0044 18.734 12.8425 19.0309 12.5507C19.3278 12.2588 19.4966 11.861 19.5 11.4447V5.55666C19.4966 5.14054 19.328 4.74282 19.0313 4.45101C18.7346 4.1592 18.3341 3.9972 17.918 4.00066H15.082C14.6659 3.9972 14.2654 4.1592 13.9687 4.45101C13.672 4.74282 13.5034 5.14054 13.5 5.55666V11.4447C13.5034 11.8608 13.672 12.2585 13.9687 12.5503C14.2654 12.8421 14.6659 13.0041 15.082 13.0007Z" /><path fillRule="evenodd" clipRule="evenodd" d="M15.082 19.0006H17.917C18.7661 19.0247 19.4744 18.3567 19.5 17.5076V16.4936C19.4744 15.6449 18.7667 14.9771 17.918 15.0006H15.082C14.2333 14.9771 13.5256 15.6449 13.5 16.4936V17.5066C13.525 18.3557 14.2329 19.0241 15.082 19.0006Z" /></g>,
  arrowLeft: <path d="m12 19-7-7 7-7M19 12H5" />,
  mail: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  qr: <><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1" /></>,
  cart: <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
  server: <><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><path d="M6 6h.01M6 18h.01" /></>,
  circleCheck: <><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>,
  power: <><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
  edit: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></>,
  phone: <path d="M13.4 2.6a2 2 0 0 0-2.8 0L8.7 4.5a2 2 0 0 0-.5 2c.4 1.6 1.3 3.7 3.2 5.6s4 2.8 5.6 3.2a2 2 0 0 0 2-.5l1.9-1.9a2 2 0 0 0 0-2.8l-2-2a2 2 0 0 0-2.2-.4l-1 .4c-.7-.5-1.4-1.1-2-1.8-.7-.6-1.3-1.3-1.8-2l.4-1a2 2 0 0 0-.4-2.2z" />,
  image: <><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></>,
  tag: <><path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .59 1.41l8.6 8.6a2 2 0 0 0 2.82 0l8-8a2 2 0 0 0 0-2.82l-8.6-8.6A2 2 0 0 0 12.6 2Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h10" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  copy: <><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  arrowUpRight: <path d="M7 17 17 7M7 7h10v10" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  circleX: <><circle cx="12" cy="12" r="9" /><path d="m15 9-6 6M9 9l6 6" /></>,
  headset: <><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3zM3 16a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H3z" /><path d="M19 18v1a3 3 0 0 1-3 3h-3" /></>,
  lock: <><rect width="16" height="10" x="4" y="11" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  send: <><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></>,
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  alertTriangle: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" /></>,
  checkCheck: <><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></>,
} as const

export type IconName = keyof typeof ICON_PATHS

// Ikon dari file SVG kustom (dashboard, produk, top up, pengaturan): sudah dinormalisasi
// ke kotak 24x24 dengan ukuran glyph 20 agar tampak sama besar. Ikon ini digambar dengan
// fill (bukan stroke seperti ikon Lucide lainnya).
const CUSTOM_ICONS: ReadonlySet<IconName> = new Set<IconName>(['dashboard', 'package', 'card', 'settings'])

export function Icon({ name, size = 20, strokeWidth = 1.75, className, style }: { name: IconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={CUSTOM_ICONS.has(name) ? 'currentColor' : 'none'} stroke={CUSTOM_ICONS.has(name) ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" style={{ flexShrink: 0, ...style }}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

// Warna ikon solid (gradasi) — tidak transparan
export const TONE = {
  blue:   'linear-gradient(135deg, #4d8dff 0%, #2657c9 100%)',
  gold:   'linear-gradient(135deg, #f7c04a 0%, #c98a12 100%)',
  purple: 'linear-gradient(135deg, #b39bff 0%, #7c3aed 100%)',
  green:  'linear-gradient(135deg, #34d374 0%, #15803d 100%)',
  pink:   'linear-gradient(135deg, #f78bc4 0%, #db2777 100%)',
  cyan:   'linear-gradient(135deg, #38dcf5 0%, #0891b2 100%)',
}


export const formatRp = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID')
export const toneKey = (bg: string) => Object.keys(TONE).find(k => TONE[k as keyof typeof TONE] === bg) ?? 'blue'

// Thumbnail produk: pakai foto yang diunggah admin sebagai ikon produk.
// Kalau belum ada foto, tampilkan ikon generik netral (bukan ikon/warna pilihan manual lagi).
export function ProductThumb({ url, size = 40, iconSize, className = '' }: { url?: string | null; size?: number; iconSize?: number; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 overflow-hidden text-slate-400 ${className}`}
      style={{
        width: size, height: size,
        borderRadius: Math.max(8, Math.round(size * 0.28)),
        background: url ? '#0b1220' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <Icon name="package" size={iconSize ?? Math.round(size * 0.45)} />}
    </div>
  )
}

// ─── Shared presentational primitives ─────────────────────────────────────────

export function PageHeader({ title, subtitle, actions, leading }: { title: string; subtitle?: string; actions?: React.ReactNode; leading?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        <div className="min-w-0">
          <h1 className="page-title truncate">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}

export function EmptyState({ icon = 'package', title, description, action }: { icon?: IconName; title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="icon-tile mb-4" style={{ width: 48, height: 48, borderRadius: 14 }}><Icon name={icon} size={22} /></div>
      {title && <p className="text-sm font-medium text-white">{title}</p>}
      {description && <p className="hint mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  aktif: { label: 'Aktif', cls: 'badge-success' },
  pending: { label: 'Pending', cls: 'badge-warning' },
  nonaktif: { label: 'Nonaktif', cls: 'badge-danger' },
  dibatalkan: { label: 'Dibatalkan', cls: 'badge-danger' },
  paid: { label: 'Dibayar', cls: 'badge-success' },
  approved: { label: 'Disetujui', cls: 'badge-success' },
  rejected: { label: 'Ditolak', cls: 'badge-danger' },
  expired: { label: 'Kedaluwarsa', cls: 'badge-neutral' },
  cancelled: { label: 'Dibatalkan', cls: 'badge-neutral' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: 'badge-neutral' }
  return <span className={`badge badge-dot ${s.cls}`}>{s.label}</span>
}

// Placeholder saat data dimuat
export function SkeletonRows({ rows = 3, thumb = 40 }: { rows?: number; thumb?: number }) {
  return (
    <div className="divide-y divide-white/[0.06]" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 sm:px-5 py-4">
          <div className="skeleton flex-shrink-0" style={{ width: thumb, height: thumb, borderRadius: 12 }} />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 rounded-md" style={{ width: `${55 - i * 8}%` }} />
            <div className="skeleton h-3 rounded-md w-1/3" />
          </div>
          <div className="skeleton h-7 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ height = 80 }: { height?: number }) {
  return <div className="card skeleton" style={{ height }} aria-hidden="true" />
}

// Pull-to-refresh sederhana untuk mobile: hanya aktif saat halaman sudah di paling atas,
// menahan/melepas via touch, lalu memanggil onRefresh saat ditarik cukup jauh.
const PTR_TRIGGER = 64
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY > 0 || refreshing) { startY.current = null; return }
    startY.current = e.touches[0].clientY
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0) setPull(Math.min(dy * 0.5, PTR_TRIGGER * 1.4))
  }
  async function onTouchEnd() {
    if (pull >= PTR_TRIGGER) {
      setRefreshing(true)
      setPull(PTR_TRIGGER)
      try { await onRefresh() } finally { setRefreshing(false); setPull(0) }
    } else {
      setPull(0)
    }
    startY.current = null
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="lg:contents">
      <div
        className="flex items-center justify-center overflow-hidden lg:hidden"
        style={{ height: pull, transition: startY.current === null ? 'height 200ms ease-out' : undefined }}
        aria-hidden="true"
      >
        <span
          className={`w-5 h-5 rounded-full border-2 border-slate-700 border-t-[#4f7cff] ${refreshing || pull >= PTR_TRIGGER ? 'animate-spin' : ''}`}
          style={{ opacity: Math.min(pull / PTR_TRIGGER, 1), transform: `rotate(${pull * 3}deg)` }}
        />
      </div>
      {children}
    </div>
  )
}
