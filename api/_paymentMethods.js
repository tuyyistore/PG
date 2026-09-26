// Daftar metode pembayaran yang didukung, dipetakan ke `payment_method_types`
// milik DOKU Checkout API. Lihat: https://developers.doku.com/accept-payments/doku-checkout/integration-guide
//
// Kalau mau menambah metode lain yang didukung DOKU (mis. LinkAja, Convenience
// Store Alfamart/Indomaret, Paylater Akulaku/Kredivo), cukup tambah entry baru
// di sini — tidak perlu ubah apa pun di create-payment.js / check-payment.js.
export const PAYMENT_METHODS = {
  qris: { label: 'QRIS', dokuTypes: ['QRIS'] },
  ovo: { label: 'OVO', dokuTypes: ['EMONEY_OVO'] },
  dana: { label: 'DANA', dokuTypes: ['EMONEY_DANA'] },
  shopeepay: { label: 'ShopeePay', dokuTypes: ['EMONEY_SHOPEEPAY'] },
  va_bca: { label: 'Virtual Account BCA', dokuTypes: ['VIRTUAL_ACCOUNT_BCA'] },
  va_mandiri: { label: 'Virtual Account Mandiri', dokuTypes: ['VIRTUAL_ACCOUNT_BANK_MANDIRI'] },
  va_bni: { label: 'Virtual Account BNI', dokuTypes: ['VIRTUAL_ACCOUNT_BNI'] },
  va_bri: { label: 'Virtual Account BRI', dokuTypes: ['VIRTUAL_ACCOUNT_BRI'] },
}

export const DEFAULT_PAYMENT_METHOD = 'qris'

export function resolvePaymentMethod(key) {
  return PAYMENT_METHODS[key] ?? null
}
