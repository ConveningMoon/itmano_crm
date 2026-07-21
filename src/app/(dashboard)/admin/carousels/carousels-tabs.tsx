'use client'

import { Tabs } from '@/components/ui/tabs'
import type { CarouselBrandProfile, CarouselJob, CarouselJobWithSlides } from '@/lib/carousels/types'
import type { CarouselCostReport } from '@/lib/data/carousels'
import { CarouselsClient } from './carousels-client'
import { ContextPanel } from './context-panel'
import { CostPanel } from './cost-panel'

// Envoltura de tabs del motor: Generar · Contexto · Costos. Client para poder
// alternar sin recargar; cada panel recibe sus datos ya cargados por el server.
export function CarouselsTabs({ brands, recentJobs, costs, defaultStylePrompt, initialJob }: {
  brands:     CarouselBrandProfile[]
  recentJobs: CarouselJob[]
  costs:      CarouselCostReport
  defaultStylePrompt: string
  initialJob: CarouselJobWithSlides | null
}) {
  return (
    <Tabs
      items={[
        { key: 'generate', label: 'Generar' },
        { key: 'context',  label: 'Contexto' },
        { key: 'costs',    label: 'Costos', badge: costs.carousels },
      ]}
      content={{
        generate: <CarouselsClient brands={brands} recentJobs={recentJobs} initialJob={initialJob} />,
        context:  <ContextPanel brands={brands} defaultStylePrompt={defaultStylePrompt} />,
        costs:    <CostPanel report={costs} />,
      }}
    />
  )
}
