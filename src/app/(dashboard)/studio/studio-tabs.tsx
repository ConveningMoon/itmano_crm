'use client'

import { useMemo, useState } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { RecipeForm } from './recipe-form'
import { FreeImageForm } from './free-image-form'
import { Library } from './library'
import type { AgentOption, PropertyOption } from '@/lib/data/studio'
import type { StudioImage } from '@/lib/studio/types'

// Envoltura del Estudio: Posts · Carruseles · Mi Imagen.
//
// Posts y Mi Imagen son dos oficios distintos y por eso son dos pestañas: un
// post se ARMA con los datos del CRM sobre un diseño, y una imagen libre se
// PIDE con un prompt. Mezclarlos en un formulario obligaba a esconder la mitad
// de los campos según el caso.
//
// El motor de carruseles entra entero como nodo ya renderizado por el servidor
// (patrón isla), con sus propios sub-tabs adentro.

const gridStyle: React.CSSProperties = {
  display: 'grid', gap: '28px', gridTemplateColumns: 'minmax(320px, 420px) 1fr', alignItems: 'start',
}

export function StudioTabs({ images, properties, agents, tenantColor, carousels }: {
  images:      StudioImage[]
  properties:  PropertyOption[]
  agents:      AgentOption[]
  tenantColor: string
  carousels:   React.ReactNode
}) {
  const [items, setItems] = useState(images)

  // Cada biblioteca muestra lo suyo: buscar un post entre imágenes sueltas
  // (o al revés) es exactamente lo que la separación viene a evitar.
  const posts = useMemo(() => items.filter(i => i.recipe !== 'open_prompt'), [items])
  const mine  = useMemo(() => items.filter(i => i.recipe === 'open_prompt'), [items])

  const created = (img: StudioImage) => setItems(prev => [img, ...prev])
  const updated = (img: StudioImage) => setItems(prev => prev.map(i => (i.id === img.id ? img : i)))
  const deleted = (id: string)       => setItems(prev => prev.filter(i => i.id !== id))

  return (
    <Tabs
      items={[
        { key: 'posts',     label: 'Posts', badge: posts.length },
        { key: 'carousels', label: 'Carruseles' },
        { key: 'mine',      label: 'Mi Imagen', badge: mine.length },
      ]}
      content={{
        posts: (
          <div className="max-md:!grid-cols-1" style={gridStyle}>
            <RecipeForm
              properties={properties}
              agents={agents}
              tenantColor={tenantColor}
              onCreated={created}
            />
            <Library
              images={posts}
              emptyHint="Elige una receta a la izquierda y genera el primero."
              onCreated={created}
              onUpdated={updated}
              onDeleted={deleted}
            />
          </div>
        ),
        carousels,
        mine: (
          <div className="max-md:!grid-cols-1" style={gridStyle}>
            <FreeImageForm onCreated={created} />
            <Library
              images={mine}
              emptyHint="Describe la imagen a la izquierda y genérala."
              onCreated={created}
              onUpdated={updated}
              onDeleted={deleted}
            />
          </div>
        ),
      }}
    />
  )
}
