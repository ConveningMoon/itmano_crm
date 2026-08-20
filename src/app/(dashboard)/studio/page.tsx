import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { getStudioImages, getPropertyOptions, getAgentOptions, getStudioBrand } from '@/lib/data/studio'
import { listTemplates } from '@/lib/data/studio-templates'
import { getBrandProfiles, getRecentJobs, getCarouselCosts, getJobWithSlides } from '@/lib/data/carousels'
import { V2_COPY_RULES } from '@/lib/carousels/brand'
import { CarouselsTabs } from '../admin/carousels/carousels-tabs'
import { StudioTeaser } from './teaser'
import { StudioTabs } from './studio-tabs'

// La generación encadena Claude (dirección de escena) + Nano Banana (la escena)
// + sharp (la composición) en una sola invocación. Los fetch a Gemini tienen su
// propio timeout para abortar limpio antes de este límite.
export const maxDuration = 120

// Estudio — imágenes de marketing y carruseles. Fase de prueba, solo ITMANO:
// los roles de tenant ven el teaser. Guardado server-side por canUseStudio.
export default async function StudioPage() {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return <StudioTeaser />

  const tenantId = ctx.tenant_id
  const [images, properties, agents, brand] = tenantId
    ? await Promise.all([
        getStudioImages(tenantId), getPropertyOptions(tenantId),
        getAgentOptions(tenantId), getStudioBrand(tenantId, null),
      ])
    : [[], [], [], null]

  const [brands, recentJobs, costs, templates] = await Promise.all([
    getBrandProfiles(),
    getRecentJobs(),
    getCarouselCosts(),
    listTemplates(),
  ])
  // Auto-cargar el último carrusel en su tab (sin espera en el cliente).
  const initialJob = recentJobs.length ? await getJobWithSlides(recentJobs[0].id) : null

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Estudio
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Imágenes y carruseles · fase de prueba, solo ITMANO
        </p>
        <a href="/studio/plantillas" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none' }}>
          Editar diseños
        </a>
      </div>
      <StudioTabs
        images={images}
        properties={properties}
        agents={agents}
        templates={templates}
        tenantColor={brand?.primary_color ?? '#1B2A41'}
        carousels={
          <CarouselsTabs
            brands={brands}
            recentJobs={recentJobs}
            costs={costs}
            defaultStylePrompt={V2_COPY_RULES}
            initialJob={initialJob}
          />
        }
      />
    </>
  )
}
