'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { RecipeForm } from './recipe-form'
import { Library } from './library'
import type { AgentOption, PropertyOption } from '@/lib/data/studio'
import type { StudioImage } from '@/lib/studio/types'

// Envoltura del Estudio: Imágenes · Carruseles. El motor de carruseles entra
// entero como nodo ya renderizado por el servidor (patrón isla), con sus propios
// sub-tabs adentro — no se refactoriza para que quepa aquí.
export function StudioTabs({ images, properties, agents, tenantColor, carousels }: {
  images:      StudioImage[]
  properties:  PropertyOption[]
  agents:      AgentOption[]
  tenantColor: string
  carousels:   React.ReactNode
}) {
  const [items, setItems] = useState(images)

  return (
    <Tabs
      items={[
        { key: 'images',    label: 'Imágenes', badge: items.length },
        { key: 'carousels', label: 'Carruseles' },
      ]}
      content={{
        images: (
          <div
            className="max-md:!grid-cols-1"
            style={{ display: 'grid', gap: '28px', gridTemplateColumns: 'minmax(320px, 420px) 1fr', alignItems: 'start' }}
          >
            <RecipeForm
              properties={properties}
              agents={agents}
              tenantColor={tenantColor}
              onCreated={img => setItems(prev => [img, ...prev])}
            />
            <Library
              images={items}
              onCreated={img => setItems(prev => [img, ...prev])}
              onUpdated={img => setItems(prev => prev.map(i => (i.id === img.id ? img : i)))}
              onDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
            />
          </div>
        ),
        carousels,
      }}
    />
  )
}
