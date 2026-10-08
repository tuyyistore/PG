/**
 * Jeda polling status pembayaran: cepat di awal (user baru saja scan QR), lalu melambat.
 * Webhook adalah jalur utama; polling hanya cadangan, jadi tidak perlu menembak server tiap 5 detik selamanya.
 */
export const POLL_STEPS_MS = [5000, 5000, 10000, 10000, 15000, 15000, 30000]

/** Jeda (ms) sebelum percobaan ke-`attempt` (mulai dari 0). Berhenti naik di langkah terakhir. */
export const pollDelay = (attempt: number): number =>
  POLL_STEPS_MS[Math.min(Math.max(0, Math.floor(attempt)), POLL_STEPS_MS.length - 1)]
