// GET ?id=<topupId> → fallback bila webhook terlambat/tidak sampai. Hanya pemilik top up.
// Logika (termasuk throttle) ada di _btzHandlers.js (bisa dites).
import { requireUser } from './_auth.js'
import { findOwned, syncTopup } from './_btz.js'
import { log } from './_betabotz.js'
import { createStatusHandler } from './_btzHandlers.js'

export default createStatusHandler({ requireUser, findOwned, syncTopup, log })
