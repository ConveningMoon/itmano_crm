'use client'

import { Tabs } from '@/components/ui/tabs'
import type { CarouselBrandProfile, CarouselJob } from '@/lib/carousels/types'
import type { CarouselCostReport } from '@/lib/data/carousels'
import { CarouselsClient } from './carousels-client'
import { ContextPanel } from './context-panel'
import { CostPanel } from './cost-panel'

// Envoltura de tabs del motor: Generar · Contexto · Costos. Client para poder
// alternar sin recargar; cada panel recibe sus datos ya cargados por el server.
export function CarouselsTabs({ brands, recentJobs, costs }: {
  brands:     CarouselBrandProfile[]
  recentJobs: CarouselJob[]
  costs:      CarouselCostReport
}) {
  return (
    <Tabs
      items={[
        { key: 'generate', label: 'Generar' },
        { key: 'context',  label: 'Contexto' },
        { key: 'costs',    label: 'Costos', badge: costs.carousels },
      ]}
      content={{
        generate: <CarouselsClient brands={brands} recentJobs={recentJobs} />,
        context:  <ContextPanel brands={brands} />,
        costs:    <CostPanel report={costs} />,
      }}
    />
  )
}
