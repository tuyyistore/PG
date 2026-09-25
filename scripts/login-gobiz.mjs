// Jalankan SEKALI di komputer/laptop kamu sendiri (BUKAN di Vercel):
//
//   node scripts/login-gobiz.mjs
//
// OTP dikirim ke nomor HP akun GoBiz Merchant kamu, masukkan saat diminta.
// Setelah berhasil, script ini mencetak GOPAY_TOKEN & GOPAY_MERCHANT_ID —
// salin dua nilai itu ke:
//   1. Vercel → Project Settings → Environment Variables (agar dipakai backend), DAN
//   2. Tabel `gobiz_session` di Supabase (baris id=1) lewat SQL editor, contoh:
//        insert into gobiz_session (id, token, merchant_id)
//        values (1, 'TOKEN_DISINI', 'MERCHANT_ID_DISINI')
//        on conflict (id) do update set token = excluded.token, merchant_id = excluded.merchant_id;
//
// Kalau token ini nanti kadaluarsa (login GoBiz logout paksa / refresh gagal),
// tinggal jalankan ulang script ini dan update lagi dua tempat di atas.
import GoPayMerchant from 'gobiz-payment'
import readline from 'node:readline/promises'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

const phone = await rl.question('Nomor HP akun GoBiz Merchant (misal 08123456789): ')

const merchant = new GoPayMerchant({
  loginMethod: 'otp',
  phone,
  otpCallback: async () => {
    const code = await rl.question('Masukkan kode OTP yang dikirim ke HP: ')
    return code.trim()
  },
})

await merchant.init()
rl.close()

console.log('\nLogin berhasil. Simpan dua nilai ini:\n')
console.log('GOPAY_TOKEN=' + merchant.token)
console.log('GOPAY_MERCHANT_ID=' + merchant.merchantId)
