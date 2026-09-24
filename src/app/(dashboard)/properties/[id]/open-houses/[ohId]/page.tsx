import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getPropertyById } from '@/lib/data/properties'
import { getOpenHouseDetail } from '@/lib/data/open-houses'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { buildOpenHouseIntegrationPrompt } from '@/lib/open-houses/integration-prompt'
import { appBaseUrl } from '@/lib/open-houses/urls'
import { hostedPropertiesUrl } from '@/lib/hosted-page'
import { OpenHouseManager } from './open-house-manager'

// Detalle de un open house: datos, correos (por idioma), audiencia y
// confirmación, RSVPs y cómo se ve en la web. El servidor arma todo y el
// gestor (cliente) sólo pinta y llama a las Server Actions.

export default async function OpenHouseDetailPage({ params }: { params: Promise<{ id: string; ohId: string }> }) {
  const { id, ohId } = await params
  const ctx = await requireTenantContext()

  const property = await getPropertyById(id, ctx.tenant_id)
  if (!property) notFound()
  const detail = await getOpenHouseDetail(ohId, property.tenantId)
  if (!detail || detail.openHouse.propertyId !== property.id) notFound()

  const db = createAdminClient()
  const [sender, { data: tenant }] = await Promise.all([
    resolveOpenHouseSender(db, property.tenantId),
    db.from('tenants').select('name, slug').eq('id', property.tenantId).maybeSingle(),
  ])
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
      <div style={{ marginBottom: '20px' }}>
        <Link href={`/properties/${property.id}?tab=openhouse`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> {property.name ?? property.address}
        </Link>
      </div>
      <OpenHouseManager
        detail={detail}
        canManage={canManage}
        senderError={sender.ok ? null : sender.error}
        integrationPrompt={integrationPrompt}
        publicUrl={publicUrl}
        localPreviewUrl={localPreviewUrl}
        previewAgentId={ctx.agent_id ?? property.createdByAgentId ?? null}
      />
    </>
  )
}
