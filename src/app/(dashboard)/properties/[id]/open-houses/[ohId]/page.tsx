import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getPropertyById } from '@/lib/data/properties'
import { getOpenHouseDetail, listSenderAgents } from '@/lib/data/open-houses'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { buildOpenHouseIntegrationPrompt } from '@/lib/open-houses/integration-prompt'
import { appBaseUrl } from '@/lib/open-houses/urls'
import { hostedPropertiesUrl } from '@/lib/hosted-page'
import { OpenHouseManager } from './open-house-manager'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { OpenHouseDetailSkeleton } from './open-house-skeleton'

// Detalle de un open house: datos, correos (por idioma), audiencia y
// confirmación, RSVPs y cómo se ve en la web. El servidor arma todo y el
// gestor (cliente) sólo pinta y llama a las Server Actions.

type Params = Promise<{ id: string; ohId: string }>

async function OpenHouseContent({ params }: { params: Params }) {
  const { id, ohId } = await params
  const ctx = await requireTenantContext()
  // requireTenantContext no deja pasar a nadie sin tenant: un super_admin sin
  // selección va al hub. Todo se pide por el tenant del contexto, en una sola
  // ola: la propiedad, el open house y lo demás no dependen unos de otros (antes
  // eran tres olas en serie). Una propiedad u open house de otro tenant no
  // resuelve y termina en 404, igual que antes.
  const tenantId = ctx.tenant_id
  if (!tenantId) notFound()

  const db = createAdminClient()
  const [property, detail, sender, { data: tenant }, agents] = await Promise.all([
    getPropertyById(id, tenantId),
    getOpenHouseDetail(ohId, tenantId),
    resolveOpenHouseSender(db, tenantId),
    db.from('tenants').select('name, slug').eq('id', tenantId).maybeSingle(),
    listSenderAgents(tenantId),
  ])
  if (!property) notFound()
  if (!detail || detail.openHouse.propertyId !== property.id) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (tenant ?? {}) as any
  const tenantSlug = (t.slug as string | null) ?? ''

  const canManage = ctx.role !== 'agent' || detail.openHouse.createdByUserId === ctx.user_id

  const integrationPrompt = buildOpenHouseIntegrationPrompt({
    tenantName:   (t.name as string | null) ?? '',
    tenantId:     property.tenantId,
    baseUrl:      appBaseUrl(),
    supabaseUrl:  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey:      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    propertyId:   property.id,
    propertyName: property.name ?? property.address,
    propertySlug: property.slug,
  })

  const publicUrl = property.publishedToWeb && property.slug && tenantSlug
    ? `${hostedPropertiesUrl(tenantSlug)}/${property.slug}`
    : null
  const localPreviewUrl = property.publishedToWeb && property.slug && tenantSlug
    ? `/web/${tenantSlug}/${property.slug}`
    : null

  return (
    <>
      <Link href={`/properties/${property.id}?tab=openhouse`} className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> {property.name ?? property.address}
      </Link>
      <OpenHouseManager
        detail={detail}
        canManage={canManage}
        senderError={sender.ok ? null : sender.error}
        integrationPrompt={integrationPrompt}
        publicUrl={publicUrl}
        localPreviewUrl={localPreviewUrl}
        agents={agents}
        // La vista previa firma como firmaría el envío: el remitente elegido o,
        // en modo "cada lead", un agente de muestra del equipo.
        previewAgentId={detail.openHouse.senderAgentId ?? ctx.agent_id ?? property.createdByAgentId ?? null}
      />
    </>
  )
}

function OpenHouseDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<OpenHouseDetailSkeleton />}>
      <OpenHouseContent params={params} />
    </Suspense>
  )
}

export default freshOnNavigation(OpenHouseDetailPage)
