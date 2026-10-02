// Fungsi murni (tanpa React/DOM) supaya bisa dites langsung dengan `node --test`.

/** Cegah formula injection di Excel/Sheets: sel teks yang diawali = + - @ (atau tab/CR) diberi apostrof. */
export function csvCell(v: unknown): string | number {
  if (typeof v === 'number') return v
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/** Potongan query PostgREST `&or=(f1.ilike."*kata*",f2.ilike."*kata*")`; string kosong bila kata kosong. */
export function ilikeOr(fields: string[], raw: string): string {
  const t = raw.trim().replace(/[\\"*%]/g, '')
  if (!t) return ''
  return `&or=${encodeURIComponent('(' + fields.map(f => `${f}.ilike."*${t}*"`).join(',') + ')')}`
}
