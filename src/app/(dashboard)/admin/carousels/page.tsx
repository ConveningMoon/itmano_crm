import { redirect } from 'next/navigation'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canAccessCarouselEngine } from '@/lib/access/carousel-engine'
import { getBrandProfiles, getRecentJobs, getCarouselCosts } from '@/lib/data/carousels'
import { V2_COPY_RULES } from '@/lib/carousels/brand'
import { CarouselsTabs } from './carousels-tabs'

// Motor de carruseles — fase de prueba, SOLO super_admin. Genera carruseles de
// Instagram (tema → copy → imágenes → slides compuestos) para agentes de un
// tenant. Guardado server-side por canAccessCarouselEngine.
export default async function CarouselsPage() {
  const ctx = await getCurrentTenantContext()
  if (!canAccessCarouselEngine(ctx)) redirect('/dashboard')

  const [brands, recentJobs, costs] = await Promise.all([
    getBrandProfiles(),
    getRecentJobs(),
    getCarouselCosts(),
  ])

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Motor de carruseles
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Tema → copy → imágenes → slides · fase de prueba, solo ITMANO
        </p>
      </div>
      <CarouselsTabs brands={brands} recentJobs={recentJobs} costs={costs} defaultStylePrompt={V2_COPY_RULES} />
    </>
  )
}
