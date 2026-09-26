import type React from 'react'

// ─── Icons (inline SVG, gaya Lucide — tanpa dependensi tambahan) ──────────────

export const ICON_PATHS = {
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>,
  building: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4M10 10h4M10 14h4M10 18h4" /></>,
  gem: <><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></>,
  monitor: <><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  infinity: <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />,
  wrench: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  shield: <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />,
  check: <polyline points="20 6 9 17 4 12" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M5 12h14M12 5v14" />,
  package: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></>,
  clipboard: <><rect width="8" height="4" x="8" y="2" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" /></>,
  card: <><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></>,
  wallet: <><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>,
  message: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><path d="M21 12H9" /></>,
  dashboard: <><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>,
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
} as const

export type IconName = keyof typeof ICON_PATHS

export function Icon({ name, size = 20, strokeWidth = 1.75, className, style }: { name: IconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
  paid: { label: 'Dibayar', cls: 'badge-success' },
  approved: { label: 'Disetujui', cls: 'badge-success' },
  rejected: { label: 'Ditolak', cls: 'badge-danger' },
  expired: { label: 'Kedaluwarsa', cls: 'badge-neutral' },
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
