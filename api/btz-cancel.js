// POST { id } → batalkan top up gateway milik user. Cek status dulu (bisa jadi sudah dibayar), lalu batalkan di Betabotz.
// Logika ada di _btzHandlers.js (bisa dites).
import { requireUser } from './_auth.js'
import { findOwned, syncTopup, markCancelled } from './_btz.js'
import { cancelTransaction, log } from './_betabotz.js'
import { createCancelHandler } from './_btzHandlers.js'

export default createCancelHandler({ requireUser, findOwned, syncTopup, cancelTransaction, markCancelled, log })
