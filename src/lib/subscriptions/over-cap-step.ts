import 'server-only'
import { revalidateTag } from 'next/cache'
import { hostedTag } from '@/lib/hosted-cache'
import { columns } from '@/lib/supabase/columns'
import { planPublishCap, selectOverCapAction } from '@/lib/subscriptions/over-cap'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import type { createAdminClient } from '@/lib/supabase/admin'

const OVER_CAP_SUBSCRIPTION_COLUMNS = columns('subscriptions', ['tenant_id', 'plan', 'over_cap_since'])
const PUBLISHED_PROPERTY_COLUMNS = columns('properties', ['id'])

type Db = ReturnType<typeof createAdminClient>

// Paso del cron billing-lifecycle: propiedades por encima del tope del PLAN
// para tenants NO degradados (los paused/cancelled/expired los trata el paso 1
// con el tope de cortesia) y no exentos. Por tenant: si publicadas > tope se
// fija `over_cap_since` (primera pasada), a los 14 dias se despublican las
// sobrantes (se conservan las mas recientes, no destructivo) y si vuelve a
// estar dentro del tope la marca se limpia. Una query de suscripciones y un
// conteo head por tenant que lo necesita (pocos tenants); un tenant con tope
// ilimitado y sin marca no consulta nada. Cada tenant va aislado.
export async function runOverCapStep(
  supabase: Db,
  now: Date,
  logError: (step: string, tenantId: string | null, error: unknown) => void,
): Promise<{ marked: number; cleared: number; unpublished: number }> {
  const result = { marked: 0, cleared: 0, unpublished: 0 }

  const { data: capSubs, error: capSubsError } = await supabase
    .from('subscriptions')
    .select(OVER_CAP_SUBSCRIPTION_COLUMNS)
    .not('status', 'in', '(paused,cancelled,expired)')
    .eq('billing_exempt', false)
  if (capSubsError) throw capSubsError

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (capSubs ?? []) as any[]) {
    try {
      const cap = planPublishCap(row.plan as SubscriptionPlan)
      const overCapSince = (row.over_cap_since as string | null) ?? null
      if (cap === null && overCapSince === null) continue

      const { count, error: countError } = await supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', row.tenant_id)
        .eq('published_to_web', true)
      if (countError) throw countError

      const action = selectOverCapAction({ published: count ?? 0, cap, overCapSince, now })

      if (action === 'mark' || action === 'clear') {
        const { error } = await supabase
          .from('subscriptions')
          .update({ over_cap_since: action === 'mark' ? now.toISOString() : null })
          .eq('tenant_id', row.tenant_id)
        if (error) { logError('over-cap', row.tenant_id, error); continue }
        if (action === 'mark') result.marked += 1
        else result.cleared += 1
        continue
      }

      if (action === 'unpublish' && cap !== null) {
        const { data: publishedRows, error: publishedError } = await supabase
          .from('properties')
          .select(PUBLISHED_PROPERTY_COLUMNS)
          .eq('tenant_id', row.tenant_id)
          .eq('published_to_web', true)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
        if (publishedError) throw publishedError

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toUnpublish = ((publishedRows ?? []) as any[]).slice(cap).map(p => p.id as string)
        if (toUnpublish.length === 0) continue

        const { error } = await supabase
          .from('properties')
          .update({ published_to_web: false, unpublished_by_billing: true })
          .eq('tenant_id', row.tenant_id)
          .in('id', toUnpublish)
        if (error) { logError('over-cap', row.tenant_id, error); continue }

        result.unpublished += toUnpublish.length
        // updateTag no existe fuera de Server Actions: expire 0, best-effort.
        try {
          revalidateTag(hostedTag.web(row.tenant_id), { expire: 0 })
        } catch (err) {
          logError('over-cap', row.tenant_id, err)
        }
        // over_cap_since se queda: la pasada siguiente ve published <= cap y
        // lo limpia ('clear').
      }
    } catch (err) {
      logError('over-cap', row.tenant_id, err)
    }
  }
  return result
}
