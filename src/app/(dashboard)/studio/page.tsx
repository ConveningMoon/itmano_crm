import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { getStudioImages, getPropertyOptions, getAgentOptions, getStudioBrand } from '@/lib/data/studio'
import { listTemplates } from '@/lib/data/studio-templates'
import { StudioTeaser } from './teaser'
import { StudioTabs } from './studio-tabs'

// La generación encadena Claude (dirección de escena) + Nano Banana (la escena)
// + sharp (la composición) en una sola invocación. Los fetch a Gemini tienen su
// propio timeout para abortar limpio antes de este límite.
export const maxDuration = 120

// Estudio — imágenes de marketing. Fase de prueba, solo ITMANO:
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

  const templates = await listTemplates()

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Estudio
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Imágenes · fase de prueba, solo ITMANO
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
      />
    </>
  )
}
