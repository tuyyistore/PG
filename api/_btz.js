// Penghubung Betabotz ↔ Supabase (service_role). Semua perubahan saldo lewat RPC settle_gateway_topup.
import { supabaseAdmin } from './_supabaseAdmin.js'
import { getTransaction, log } from './_betabotz.js'
import { createSyncer } from './_btzSync.js'

export const TOPUP_COLS = 'id,user_id,amount,status,gateway,btz_transaction_id,btz_access_key,payment_url,qris_string,total_amount,expired_at,created_at'

const db = {
  async settle({ topupId, txId, paidAmount, paidAt, response }) {
    const { data, error } = await supabaseAdmin.rpc('settle_gateway_topup', {
      p_topup_id: topupId, p_txid: txId, p_paid_amount: paidAmount, p_paid_at: paidAt, p_response: response,
    })
    if (error) throw new Error(`settle_gateway_topup gagal: ${error.code ?? ''} ${error.message}`)
    return { credited: Boolean(data?.credited), status: data?.status ?? null }
  },
  async markTerminal({ topupId, status, response }) {
    const { data, error } = await supabaseAdmin.from('topups')
      .update({ status, gateway_response: response }).eq('id', topupId).eq('status', 'pending').select('id')
    if (error) throw new Error(`update top up gagal: ${error.code ?? ''} ${error.message}`)
    return (data?.length ?? 0) > 0
  },
}

export const syncTopup = createSyncer({ getTransaction, db, log })

export async function findByTransactionId(txId) {
  const { data, error } = await supabaseAdmin.from('topups').select(TOPUP_COLS).eq('btz_transaction_id', txId).maybeSingle()
  if (error) throw new Error(`baca top up gagal: ${error.code ?? ''} ${error.message}`)
  return data
}

export async function findOwned(id, userId) {
  const { data, error } = await supabaseAdmin.from('topups').select(TOPUP_COLS)
    .eq('id', id).eq('user_id', userId).eq('gateway', 'betabotz').maybeSingle()
  if (error) throw new Error(`baca top up gagal: ${error.code ?? ''} ${error.message}`)
  return data
}
