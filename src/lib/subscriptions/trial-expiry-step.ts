import 'server-only'
import { columns } from '@/lib/supabase/columns'
import { notifyDegradation } from '@/lib/subscriptions/notify-degradation'
import { sendTrialNotice, trialNoticeDue } from '@/lib/subscriptions/trial-notice'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>
type LogError = (step: string, tenantId: string | null, error: unknown) => void

const TRIAL_COLUMNS = columns('subscriptions', ['tenant_id', 'trial_ends_at', 'degraded_at'])
const NOTICE_COLUMNS = columns('subscriptions', ['tenant_id', 'trial_ends_at'])

// Paso 0 del cron: pruebas vencidas sin suscripción de Paddle y no exentas pasan
// a 'expired' con degraded_at = trial_ends_at (los plazos de gracia arrancan al
// vencer, no cuando corrió el cron). El update es condicional a que siga en
// 'trial' (idempotente y a prueba de carreras): sólo se avisa si de verdad
// cambió una fila. Cada tenant va aislado.
export async function runTrialExpiryStep(
  supabase: Db,
  now: Date,
  logError: LogError,
  notify: typeof notifyDegradation = notifyDegradation,
): Promise<{ expired: number; failed: number }> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(TRIAL_COLUMNS)
    .eq('status', 'trial')
    .lt('trial_ends_at', now.toISOString())
    .is('paddle_subscription_id', null)
    .eq('billing_exempt', false)
  if (error) throw error

  let expired = 0
  let failed = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    try {
      const { data: updated, error: updateError } = await supabase
        .from('subscriptions')
        .update({
          status:      'expired',
          degraded_at: (row.degraded_at as string | null) ?? row.trial_ends_at,
          updated_at:  now.toISOString(),
        })
        .eq('tenant_id', row.tenant_id)
        .eq('status', 'trial')
        .select('tenant_id')
      if (updateError) { failed += 1; logError('trial-expiry', row.tenant_id, updateError); continue }
      if (!updated || updated.length === 0) continue
      expired += 1
      try {
        await notify(row.tenant_id, 'expired')
      } catch (err) {
        logError('trial-expiry-notify', row.tenant_id, err)
      }
    } catch (err) {
      failed += 1
      logError('trial-expiry', row.tenant_id, err)
    }
  }
  return { expired, failed }
}

// Avisos de fin de prueba: 3 días antes y el día del vencimiento. Incluye
// 'expired' porque el paso 0 ya movió a las que vencieron hoy. Cada tenant va
// aislado; la idempotencia vive en sendTrialNotice.
export async function runTrialNoticeStep(
  supabase: Db,
  now: Date,
  logError: LogError,
  send: typeof sendTrialNotice = sendTrialNotice,
): Promise<{ sent: number; failed: number }> {
  const from = new Date(now.getTime() - 86_400_000).toISOString()
  const to = new Date(now.getTime() + 3 * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('subscriptions')
    .select(NOTICE_COLUMNS)
    .in('status', ['trial', 'expired'])
    .is('paddle_subscription_id', null)
    .eq('billing_exempt', false)
    .gte('trial_ends_at', from)
    .lte('trial_ends_at', to)
  if (error) throw error

  let sent = 0
  let failed = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    try {
      const moment = trialNoticeDue(row.trial_ends_at, now)
      if (!moment) continue
      const r = await send(supabase, { tenantId: row.tenant_id, moment, trialEndsAt: row.trial_ends_at })
      if (r === 'sent') sent += 1
    } catch (err) {
      failed += 1
      logError('trial-notice', row.tenant_id, err)
    }
  }
  return { sent, failed }
}
