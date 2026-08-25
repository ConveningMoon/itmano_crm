import { notFound, redirect } from 'next/navigation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getEditionById, getSeriesById } from '@/lib/data/newsletters'
import { getStudioImages } from '@/lib/data/studio'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { EditionEditor } from './edition-editor'

// Editor de una edición. Server Component: hace todo el fetch (edición, serie,
// biblioteca del Estudio, slug del tenant) y se lo pasa como props a
// EditionEditor (client). Un `agent` sólo edita lo que creó — mismo patrón que
// properties/[id]/page.tsx: la página siempre carga (lectura abierta al
// tenant), sólo se restringe la ESCRITURA vía `canEdit`.

const TENANT_COLUMNS       = columns('tenants', ['slug'])
const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])

export default async function EditionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const edition = await getEditionById(id, tenantId)
  if (!edition) notFound()

  const canEdit = ctx.role !== 'agent' || edition.createdByUserId === ctx.user_id

  const [series, studioImages, { data: tenantRow }] = await Promise.all([
    getSeriesById(edition.channelId, tenantId),
    getStudioImages(tenantId),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
  ])
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''

  // URL ABSOLUTA de news.itmano.com: es la dirección pública de la edición, la
  // que el tenant comparte. La ruta interna /nl/… también responde bajo
  // app.itmano.com desde que salió del matcher del proxy, pero no es la
  // dirección canónica: el escaparate vive en el subdominio de newsletters.
  const publicUrl = tenantSlug && series
    ? hostedNewsletterUrl(tenantSlug, series.slug, edition.slug)
    : null

  return (
    <EditionEditor
      edition={edition}
      seriesName={series?.name ?? null}
      canEdit={canEdit}
      studioImages={studioImages}
      publicUrl={publicUrl}
    />
  )
}
