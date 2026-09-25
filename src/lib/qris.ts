// Utilitas QRIS Dinamis — mengubah QRIS statis (dari akun GoPay Merchant kamu)
// jadi QRIS dinamis dengan nominal tertentu, sesuai standar EMVCo QR Code.
// Tidak ada bagian dari ini yang rahasia — persis algoritma yang dipakai semua
// "generator QRIS dinamis" yang beredar publik.

function crc16ccitt(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function tlv(tag: string, value: string): string {
  return `${tag}${value.length.toString().padStart(2, '0')}${value}`
}

/** Ambil satu field TLV top-level dari payload EMVCo (untuk baca ulang tag yang sudah ada). */
function findTag(payload: string, tag: string): string | null {
  let i = 0
  while (i < payload.length - 4) {
    const t = payload.slice(i, i + 2)
    const len = Number(payload.slice(i + 2, i + 4))
    const val = payload.slice(i + 4, i + 4 + len)
    if (t === tag) return val
    i += 4 + len
  }
  return null
}

/**
 * Sisipkan nominal ke QRIS statis → hasilkan payload QRIS dinamis siap di-render jadi QR.
 * `staticPayload` = string mentah QRIS statis akun GoPay Merchant (hasil scan QRIS fisik/portal).
 */
export function buildDynamicQris(staticPayload: string, amount: number): string {
  const raw = staticPayload.trim()
  // Buang tag 63 (CRC) yang lama — akan dihitung ulang di akhir.
  const withoutCrc = raw.replace(/6304[0-9A-Fa-f]{4}$/, '')
  // Tag 01: ubah indikator "static" (11) jadi "dynamic" (12)
  let body = withoutCrc.replace(/^(00\d{2}01)\d{2}11/, '$1' + '0212').replace(/(00\d{2}01)02 ?11/, '$1' + '0212')
  if (!body.includes('010212') && !withoutCrc.includes('010212')) {
    // fallback: paksa via regex tag 01 generik apapun isinya
    body = withoutCrc.replace(/01(\d{2})(11|12)/, '01' + '02' + '12')
  }
  // Hapus tag 54 (amount) lama kalau QRIS-nya kebetulan sudah dinamis, lalu sisipkan yang baru
  body = body.replace(/54\d{2}[0-9.]+/, '')
  const amountField = tlv('54', String(Math.round(amount)))
  // Tag 54 disisipkan tepat sebelum tag 58 (Country Code) sesuai urutan spec EMVCo
  const idx = body.indexOf('5802ID')
  body = idx === -1 ? body + amountField : body.slice(0, idx) + amountField + body.slice(idx)

  const withCrcTag = body + '6304'
  return withCrcTag + crc16ccitt(withCrcTag)
}

export function readQrisMerchantName(staticPayload: string): string | null {
  return findTag(staticPayload, '59')
}
