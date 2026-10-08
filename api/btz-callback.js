// Webhook Betabotz (POST). Dokumentasi tidak menyebut tanda tangan callback, jadi payload TIDAK dipercaya:
//  1) URL callback membawa ?token=BETABOTZ_WEBHOOK_SECRET (dicek constant-time),
//  2) dari payload hanya diambil transactionId; status & nominal diambil ulang server→Betabotz,
//  3) saldo hanya bertambah lewat RPC atomik settle_gateway_topup (idempoten).
// Catatan: token di query string bisa tercatat di log proxy/Vercel — rotasi BETABOTZ_WEBHOOK_SECRET berkala.
// Logika ada di _btzHandlers.js (bisa dites); file ini hanya merangkai dependensi nyata.
import { createCallbackHandler } from './_btzHandlers.js'
import { findByTransactionId, syncTopup } from './_btz.js'
import { log } from './_betabotz.js'

export default createCallbackHandler({
  getSecret: () => process.env.BETABOTZ_WEBHOOK_SECRET,
  findByTransactionId,
  syncTopup,
  log,
})
