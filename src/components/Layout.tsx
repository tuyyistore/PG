import { displayName, displayHandle, type Row, type SessionUser } from '../lib/supabase'
import { Icon, formatRp, type IconName } from '../ui'
import { type CartItem } from '../types'
import { BrandMark, Avatar } from './Brand'

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose, activePage, onNav, onLoginClick, user, isAdmin }: {
  open: boolean; onClose: () => void; activePage: string; onNav: (p: string) => void; onLoginClick: () => void
  user: SessionUser | null; profile: Row | null; isAdmin: boolean; onLogout: () => void
}) {
  const items: { id: string; label: string; icon: IconName }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' as IconName },
    { id: 'produk',    label: 'Produk',    icon: 'package' as IconName },
    { id: 'pesanan',   label: 'Pesanan Saya', icon: 'clipboard' as IconName },
    { id: 'saldo',     label: 'Top Up Saldo', icon: 'card' as IconName },
    ...(isAdmin ? [{ id: 'admin', label: 'Dashboard Admin', icon: 'shield' as IconName }] : []),
  ]

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-[#050810]/70 backdrop-blur-[2px] lg:hidden" style={{ animation: 'fade-in 200ms' }} onClick={onClose} />}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-[264px] lg:w-64 z-40 flex flex-col bg-sidebar transition-transform duration-200 ease-out lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="h-16 flex items-center justify-between px-5">
          <BrandMark />
          <button onClick={onClose} className="btn btn-ghost btn-icon btn-sm lg:hidden" aria-label="Tutup menu"><Icon name="x" size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <p className="px-3 pb-2 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Menu</p>
          <div className="space-y-1">
            {items.map(item => {
              const active = activePage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => { onNav(item.id); onClose() }}
                  className={`nav-item ${active ? 'nav-item-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          <p className="px-3 pb-2 pt-6 text-[11px] font-medium uppercase tracking-[0.08em] text-subtle">Akun</p>
          <div className="space-y-1">
            {user ? (
              <button onClick={() => { onNav('profile'); onClose() }} className={`nav-item ${activePage === 'profile' ? 'nav-item-active' : ''}`}>
                <Icon name="settings" size={18} /><span>Pengaturan</span>
              </button>
            ) : (
              <button onClick={() => { onLoginClick(); onClose() }} className="nav-item" style={{ color: '#4f7cff' }}>
                <Icon name="user" size={18} /><span>Masuk</span>
              </button>
            )}
          </div>
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => {
              const w = window as unknown as { chaport?: { q: (...args: unknown[]) => void } }
              w.chaport?.q('open')
              onClose()
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white transition-colors duration-200"
            style={{ background: '#4f7cff' }}
          >
            <Icon name="headset" size={18} /><span>Bantuan Live</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

export const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', produk: 'Produk', pesanan: 'Pesanan Saya', saldo: 'Top Up Saldo',
  checkout: 'Checkout', profile: 'Pengaturan', admin: 'Dashboard Admin',
}

export function Header({ onMenuOpen, onProfileClick, showDropdown, onProfileAction, onSettingsClick, onLoginClick, user, profile, page }: {
  onMenuOpen: () => void
  onProfileClick: (e: React.MouseEvent) => void
  showDropdown: boolean
  onProfileAction: (a: string) => void
  onSettingsClick: () => void
  onLoginClick: () => void
  user: SessionUser | null
  profile: Row | null
  page: string
}) {
  const shownUser: SessionUser | null = user && profile?.avatar_url ? { ...user, user_metadata: { ...user.user_metadata, avatar_url: profile.avatar_url } } : user
  const shownName = user ? (profile?.full_name || displayName(user)) : ''
  const menu: { action: string; label: string; icon: IconName }[] = [
    { action: 'My Profile', label: 'Profil Saya', icon: 'user' },
    { action: 'Logout', label: 'Logout', icon: 'logout' },
  ]

  return (
    <header
      className="fixed top-0 left-0 right-0 lg:left-64 z-20 h-16 flex items-center px-4 sm:px-6 lg:px-8 justify-between bg-background/85 backdrop-blur-md"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onMenuOpen} className="btn btn-ghost btn-icon -ml-2 lg:hidden" aria-label="Buka menu">
          <Icon name="menu" size={20} />
        </button>
        <div className="lg:hidden"><BrandMark size={26} /></div>
        <div className="hidden lg:flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Workspace</span>
          <Icon name="chevronRight" size={14} className="text-subtle" />
          <span className="text-white font-medium">{PAGE_TITLES[page] ?? 'Dashboard'}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button onClick={onSettingsClick} aria-label="Pengaturan" className="btn btn-ghost btn-icon">
          <Icon name="settings" size={18} />
        </button>

        {user ? (
          <div className="relative">
            <button onClick={onProfileClick} className="flex items-center gap-2 h-10 pl-1 pr-1 sm:pr-2.5 rounded-[14px] transition-colors duration-200 hover:bg-white/[0.04]" aria-haspopup="menu" aria-expanded={showDropdown}>
              <span className="relative">
                <Avatar user={shownUser!} size={30} />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e', border: '2px solid #0b1220' }} />
              </span>
              <span className="hidden sm:block text-sm font-medium text-white max-w-[140px] truncate">{shownName}</span>
              <Icon name="chevronDown" size={14} className="hidden sm:block text-muted-foreground" />
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-12 w-56 rounded-2xl p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]" role="menu"
                style={{ background: '#1a2235', border: '1px solid rgba(255,255,255,0.08)', animation: 'dialog-in 200ms' }}
                onClick={e => e.stopPropagation()}>
                <div className="px-3 py-2.5 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-sm font-medium text-white truncate">{shownName}</p>
                  <p className="text-xs text-muted-foreground truncate">{displayHandle(user)}</p>
                </div>
                {menu.map(m => (
                  <button key={m.action} onClick={() => onProfileAction(m.action)} role="menuitem"
                    className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-[10px] text-sm text-left transition-colors duration-200 ${m.action === 'Logout' ? 'text-[#f87171] hover:bg-[#ef4444]/10' : 'text-slate-200 hover:bg-white/[0.05] hover:text-white'}`}>
                    <Icon name={m.icon} size={16} /> {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button onClick={onLoginClick} className="btn btn-primary btn-sm">
            <Icon name="user" size={16} /> Masuk
          </button>
        )}
      </div>
    </header>
  )
}


// ─── Support Button (buka live chat Chaport) ──────────────────────────────────

export function SupportButton({ raised }: { raised?: boolean }) {
  const openChat = () => {
    const w = window as unknown as { chaport?: { q: (...args: unknown[]) => void } }
    w.chaport?.q('open')
  }
  return (
    <button
      onClick={openChat}
      aria-label="Live Chat Support"
      title="Live Chat Support"
      className={`fixed right-4 sm:right-6 z-[25] w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200 hover:bg-[#5e89ff] active:scale-95 ${raised ? 'bottom-28' : 'bottom-6'}`}
      style={{ background: '#4f7cff', boxShadow: '0 8px 20px -6px rgba(0,0,0,0.5)' }}
    >
      <Icon name="headset" size={20} />
    </button>
  )
}


// ─── Cart Bar ─────────────────────────────────────────────────────────────────

export function CartBar({ cart, onCheckout }: { cart: CartItem[]; onCheckout: () => void }) {
  if (cart.length === 0) return null
  const total = cart.reduce((s, i) => s + i.product.price, 0)
  return (
    <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-20 px-4 pb-4 pt-3 sm:px-6 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/95 to-transparent">
      <div className="max-w-5xl mx-auto card flex items-center gap-3 p-2 pl-4 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]" style={{ borderColor: 'rgba(255,255,255,0.08)', animation: 'dialog-in 200ms' }}>
        <div className="icon-tile" style={{ width: 36, height: 36, borderRadius: 10 }}><Icon name="cart" size={16} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{cart.length} item dipilih</p>
          <p className="text-xs text-muted-foreground tabular">{formatRp(total)}</p>
        </div>
        <button onClick={onCheckout} className="btn btn-primary">
          Checkout <span className="hidden sm:inline tabular">· {formatRp(total)}</span> <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </div>
  )
}
