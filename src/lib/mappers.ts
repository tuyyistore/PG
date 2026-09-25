import { type Row } from './supabase'
import { TONE } from '../ui'
import { type Product, type Order } from '../types'

export const rowToProduct = (r: Row): Product => ({
  id: r.id, name: r.name, category: r.category, tagline: r.tagline ?? '', price: Number(r.price),
  originalPrice: r.original_price ? Number(r.original_price) : undefined, period: r.period ?? '',
  features: r.features ?? [], badge: r.badge ?? undefined, popular: r.popular,
  iconBg: TONE[r.tone as keyof typeof TONE] ?? TONE.blue, iconColor: '#ffffff', icon: r.icon in { zap: 1, rocket: 1, building: 1, gem: 1, monitor: 1, settings: 1, infinity: 1, wrench: 1, refresh: 1, shield: 1, server: 1, package: 1 } ? r.icon : 'package',
  logoUrl: r.logo_url ?? undefined,
})

export const rowToOrder = (r: Row): Order => ({
  id: 'ORD-' + r.id,
  product: rowToProduct({ ...r, id: r.id, name: r.product_name, tagline: '', features: [], popular: false, logo_url: r.logo_url }),
  status: r.status,
  createdAt: r.created_at,
  date: new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }),
  accountData: r.account_data ?? undefined,
})
