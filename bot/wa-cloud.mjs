// Jalur cadangan OTP lewat WhatsApp Cloud API (Meta) — OPSIONAL, nonaktif bila env tidak lengkap.
// Hanya untuk kode OTP: pesan bisnis di luar jendela 24 jam wajib memakai TEMPLATE yang sudah disetujui Meta.
// Siapkan template kategori "Authentication" dengan satu variabel (kode) di body; tombol salin-kode opsional.
//
// ENV (bot/.env):
//   WA_CLOUD_TOKEN         token akses permanen (System User) — RAHASIA
//   WA_CLOUD_PHONE_ID      Phone number ID dari WhatsApp Manager
//   WA_CLOUD_OTP_TEMPLATE  nama template Authentication yang sudah disetujui
//   WA_CLOUD_OTP_LANG      kode bahasa template (default: id)
//   WA_CLOUD_OTP_BUTTON    "false" bila template TIDAK punya tombol salin-kode (default: true)
//   WA_CLOUD_API_VERSION   versi Graph API (default: v21.0)

/** Konfigurasi dari env, atau null bila belum lengkap (→ fitur nonaktif). */
export function cloudConfigFromEnv(env = process.env) {
  const token = env.WA_CLOUD_TOKEN, phoneId = env.WA_CLOUD_PHONE_ID, template = env.WA_CLOUD_OTP_TEMPLATE
  if (!token || !phoneId || !template) return null
  return {
    token, phoneId, template,
    lang: env.WA_CLOUD_OTP_LANG || 'id',
    copyButton: env.WA_CLOUD_OTP_BUTTON !== 'false',
    version: env.WA_CLOUD_API_VERSION || 'v21.0',
    timeoutMs: 15000,
  }
}

/** Ambil kode 6 digit dari teks pesan OTP. null bila tidak ada atau ambigu (lebih dari satu). */
export function extractOtpCode(message) {
  const found = String(message ?? '').match(/(?<!\d)\d{6}(?!\d)/g)
  return found && found.length === 1 ? found[0] : null
}

/** Payload resmi untuk template Authentication (body = kode; tombol salin-kode memakai kode yang sama). */
export function buildOtpPayload(phone, code, cfg) {
  const components = [{ type: 'body', parameters: [{ type: 'text', text: code }] }]
  if (cfg.copyButton) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] })
  return {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: { name: cfg.template, language: { code: cfg.lang }, components },
  }
}

export function createCloudSender(cfg, { fetchImpl = globalThis.fetch } = {}) {
  return {
    /** Kirim baris wa_outbox kind='otp'. Melempar Error (tanpa memuat token/kode) bila gagal. */
    async sendOtp(row) {
      const phone = String(row.phone ?? '')
      if (!/^[1-9]\d{9,14}$/.test(phone)) throw new Error('nomor tujuan tidak valid untuk Cloud API')
      const code = extractOtpCode(row.message)
      if (!code) throw new Error('kode OTP tidak ditemukan/ambigu di pesan')
      let r
      try {
        r = await fetchImpl(`https://graph.facebook.com/${cfg.version}/${encodeURIComponent(cfg.phoneId)}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildOtpPayload(phone, code, cfg)),
          signal: AbortSignal.timeout(cfg.timeoutMs),
        })
      } catch (e) { throw new Error(`koneksi ke Cloud API gagal (${e?.name ?? 'error'})`) }
      if (!r.ok) {
        let detail = ''
        try { const j = await r.json(); detail = j?.error?.message ? `: ${String(j.error.message).slice(0, 150)}` : '' } catch { /* bukan JSON */ }
        throw new Error(`Cloud API HTTP ${r.status}${detail}`)
      }
    },
  }
}
