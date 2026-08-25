import { redirect } from 'next/navigation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getSeriesForTenant } from '@/lib/data/newsletters'
import { getStudioImages } from '@/lib/data/studio'
import { canUseNewsletters } from '@/lib/access/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { NewEditionForm } from './new-edition-form'

// Creación de una edición nueva. Server Component: fetch de series + biblioteca
// del Estudio, luego el formulario (client) hace su trabajo y navega al editor
// completo en /newsletters/<id>.

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])

export default async function NewEditionPage() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) redirect('/newsletters')
  const tenantId = ctx.tenant_id

  const db = createAdminClient()
  const { data: subRow } = await db
    .from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  if (!canUseNewsletters({ role: ctx.role }, plan)) redirect('/newsletters')

  const [series, studioImages] = await Promise.all([
    getSeriesForTenant(tenantId),
    getStudioImages(tenantId),
  ])

  return <NewEditionForm series={series} studioImages={studioImages} />
}
