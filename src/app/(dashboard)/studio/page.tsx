import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { StudioTeaser } from './teaser'

// La generación encadena Claude (dirección de escena) + Nano Banana (la escena)
// + sharp (la composición) en una sola invocación. Los fetch a Gemini tienen su
// propio timeout para abortar limpio antes de este límite.
export const maxDuration = 120

// Estudio — imágenes de marketing y carruseles. Fase de prueba, solo ITMANO:
// los roles de tenant ven el teaser. Guardado server-side por canUseStudio.
export default async function StudioPage() {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return <StudioTeaser />

  return (
    <div style={{ marginBottom: '24px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Estudio
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
        Imágenes y carruseles · fase de prueba, solo ITMANO
      </p>
    </div>
  )
}
