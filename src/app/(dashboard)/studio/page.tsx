import { Suspense } from 'react'
import Link from 'next/link'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { getStudioImages, getPropertyOptions, getAgentOptions, getStudioBrand } from '@/lib/data/studio'
import { listTemplates } from '@/lib/data/studio-templates'
import { StudioTeaser } from './teaser'
import { StudioTabs } from './studio-tabs'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import { DEFAULT_PALETTE } from '@/lib/studio/palettes'
import { StudioSkeleton } from './studio-skeleton'

// La generación encadena Claude (dirección de escena) + Nano Banana (la escena)
// + sharp (la composición) en una sola invocación. Los fetch a Gemini tienen su
// propio timeout para abortar limpio antes de este límite.
export const maxDuration = 120

// Estudio — imágenes de marketing. Fase de prueba, solo ITMANO:
// los roles de tenant ven el teaser. Guardado server-side por canUseStudio.
async function StudioContent() {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return <StudioTeaser />

  // Los diseños son globales (no dependen del tenant), así que van en la misma
  // ola que el resto en vez de esperar a que termine.
  const tenantId = ctx.tenant_id
  const [[images, properties, agents, brand], templates] = await Promise.all([
    tenantId
      ? Promise.all([
          getStudioImages(tenantId), getPropertyOptions(tenantId),
          getAgentOptions(tenantId), getStudioBrand(tenantId, null),
        ])
      : Promise.resolve([[], [], [], null] as [
          Awaited<ReturnType<typeof getStudioImages>>,
          Awaited<ReturnType<typeof getPropertyOptions>>,
          Awaited<ReturnType<typeof getAgentOptions>>,
          Awaited<ReturnType<typeof getStudioBrand>> | null,
        ]),
    listTemplates(),
  ])

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-meta">Fase de prueba, solo ITMANO</span>
        <Link href="/studio/plantillas" className="btn btn-ghost">
          Editar diseños
          <LinkPendingSpinner />
        </Link>
      </div>
      <StudioTabs
        images={images}
        properties={properties}
        agents={agents}
        templates={templates}
        tenantColor={brand?.primary_color ?? DEFAULT_PALETTE.brand}
      />
    </>
  )
}

// La cabecera es la misma para todos y sale del shell estático; el acceso (y
// con él, teaser o estudio) se lee detrás del Suspense.
function StudioPage() {
  return (
    <>
      <PageHeader title="Estudio" description="Imágenes de marketing con tu marca, generadas desde el CRM." />
      <Suspense fallback={<StudioSkeleton />}>
        <StudioContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(StudioPage)
