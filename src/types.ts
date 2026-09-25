import { type IconName } from './ui'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Product {
  id: number
  name: string
  category: string
  tagline: string
  price: number
  originalPrice?: number
  period: string
  features: string[]
  badge?: string
  popular?: boolean
  iconBg: string
  iconColor: string
  icon: IconName
  logoUrl?: string
}

export interface CartItem { product: Product; qty: number }

export interface Order {
  id: string
  product: Product
  status: 'aktif' | 'nonaktif' | 'pending'
  date: string
  /** Tanggal asli (ISO) — dipakai grafik pengeluaran. */
  createdAt: string
  accountData?: string
}
