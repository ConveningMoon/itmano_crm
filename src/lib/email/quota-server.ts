import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseQuotaStatus, quotaRemaining, type QuotaRemaining } from '@/lib/email/quota'
import type { QuotaObservation } from '@/lib/email/quota-tracking'
import type { ResendAccount } from '@/lib/resend'

// Lado servidor de las cuotas de Resend: guardar lo observado en cada envío y
// leer cuánto queda antes de un envío masivo.

export async function recordQuotaObservation(obs: QuotaObservation): Promise<void> {
  const { error } = await createAdminClient().rpc('record_resend_send', {
    p_account:      obs.account,
    p_sent:         obs.sent,
    p_daily_used:   obs.dailyUsed,
    p_monthly_used: obs.monthlyUsed,
    p_exhausted:    obs.exhausted,
  })
  if (error) throw new Error(error.message)
}

/**
 * Cuánto queda hoy y en el mes en la cuenta. Si la lectura falla devuelve
 * "desconocido" (no limita): el 429 de Resend sigue siendo la última barrera y
 * también deja el envío en espera.
 */
export async function readQuotaRemaining(db: SupabaseClient, account: ResendAccount): Promise<QuotaRemaining> {
  const { data, error } = await db.rpc('resend_quota_status', { p_account: account })
  if (error) {
    console.error(JSON.stringify({ service: 'resend-quota', error: 'status_read_failed', account, detail: error.message }))
    return { usedToday: 0, usedMonth: 0, daily: null, monthly: null, remaining: null, binding: null }
  }
  return quotaRemaining(parseQuotaStatus(data))
}
