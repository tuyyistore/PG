// Sinkronisasi satu top up gateway dengan status asli di Betabotz.
// Dipakai bersama oleh webhook (utama) dan endpoint status (fallback) — satu jalur, satu aturan.
// Dependensi diinjeksi supaya bisa dites tanpa Supabase/jaringan.
import { evaluateTransaction, sanitizeTx } from './_btzLogic.js'

export function createSyncer({ getTransaction, db, log }) {
  return async function syncTopup(topup) {
    const same = { status: topup?.status ?? null, changed: false }
    if (!topup || topup.gateway !== 'betabotz' || !topup.btz_transaction_id || !topup.btz_access_key) return same
    if (topup.status !== 'pending' && topup.status !== 'expired') return same // sudah final: tidak perlu ke gateway

    const tx = await getTransaction(topup.btz_transaction_id, topup.btz_access_key) // melempar error bila gagal
    const v = evaluateTransaction(topup, tx)
    const ids = { topupId: topup.id, txId: topup.btz_transaction_id }

    if (v.action === 'mismatch') {
      log('error', 'tx_mismatch', { ...ids, reason: v.reason })
      return { ...same, mismatch: true }
    }
    if (v.action === 'credit') {
      const paidAt = tx.paidAt && !Number.isNaN(Date.parse(tx.paidAt)) ? new Date(tx.paidAt).toISOString() : null
      const r = await db.settle({ topupId: topup.id, txId: topup.btz_transaction_id, paidAmount: Number(tx.amount), paidAt, response: sanitizeTx(tx) })
      log('info', r.credited ? 'topup_credited' : 'topup_already_settled', { ...ids, status: r.status })
      return { status: r.status ?? 'approved', changed: r.credited }
    }
    if (v.action === 'mark') {
      const ok = await db.markTerminal({ topupId: topup.id, status: v.status, response: sanitizeTx(tx) })
      log('info', 'topup_marked', { ...ids, status: v.status, changed: ok })
      return { status: ok ? v.status : topup.status, changed: ok }
    }
    return same
  }
}
