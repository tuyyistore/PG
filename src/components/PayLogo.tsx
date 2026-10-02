// Logo bank / e-wallet. Kalau admin belum mengunggah logo, tampil inisial nama dengan warna tetap per nama.
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export function PayLogo({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const radius = Math.max(8, Math.round(size * 0.28))
  if (url) {
    return (
      <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ width: size, height: size, borderRadius: radius, background: '#ffffff', padding: Math.round(size * 0.12) }}>
        <img src={url} alt="" className="w-full h-full object-contain" loading="lazy" />
      </div>
    )
  }
  const initials = name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div className="flex items-center justify-center flex-shrink-0 font-semibold text-white" style={{ width: size, height: size, borderRadius: radius, background: `hsl(${hue(name)} 45% 32%)`, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initials}
    </div>
  )
}
