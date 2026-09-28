// Proteksi konten: blok zoom, seleksi/copy teks, dan simpan/seret gambar.
// Dikecualikan: kolom input (agar bisa mengetik/paste) dan elemen bertanda [data-allow-copy].
// Tombol "Salin" tetap jalan karena memakai navigator.clipboard.writeText langsung.
// Catatan: ini hanya penghalang untuk pengguna awam, bukan pengaman mutlak (screenshot tidak bisa diblok).

const ALLOW = 'input, textarea, select, [contenteditable="true"], [data-allow-copy]'
const allowed = (t: EventTarget | null) => t instanceof Element && !!t.closest(ALLOW)

export function installProtection() {
  const opts = { capture: true } as const
  const stop = (e: Event) => { if (!allowed(e.target)) e.preventDefault() }

  // Copy / cut / seleksi / menu klik-kanan / seret gambar
  for (const ev of ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'] as const) {
    document.addEventListener(ev, stop, opts)
  }

  // Zoom: pinch (2 jari), gesture iOS, Ctrl+scroll, Ctrl +/-/0
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false })
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false })
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })
  document.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault() }, { passive: false })
  // (double-tap zoom sudah dimatikan lewat CSS touch-action)

  // Shortcut keyboard: zoom, salin, pilih semua, lihat sumber, simpan, cetak
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (['+', '=', '-', '_', '0'].includes(k)) return e.preventDefault()
    if (['c', 'x', 'a', 'u', 's', 'p'].includes(k) && !allowed(e.target)) e.preventDefault()
  }, opts)
}
