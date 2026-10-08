// Aturan password untuk endpoint server (reset oleh admin). Samakan dengan MIN_PASSWORD_LENGTH di src/lib/supabase.ts
// dan atur juga "Minimum password length" di Supabase → Authentication → Policies (itu yang menegakkan aturan di pendaftaran).
export const MIN_PASSWORD_LENGTH = 8

/** Mengembalikan pesan error (string) bila password tidak memenuhi syarat, atau null bila valid. */
export function passwordError(pw) {
  if (typeof pw !== 'string') return 'Data tidak lengkap.'
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`
  return null
}
