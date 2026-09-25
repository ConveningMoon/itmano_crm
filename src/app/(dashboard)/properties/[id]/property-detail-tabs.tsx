'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'

// Tabs del detalle de propiedad: Descripción (datos + editar) | Página
// (constructor / embebible / solicitud) | Open house. Server content llega
// como props.
export function PropertyDetailTabs({
  descripcion, pagina, openHouse, openHouseCount, initialTab,
}: {
  descripcion:    React.ReactNode
  pagina:         React.ReactNode
  openHouse:      React.ReactNode
  openHouseCount: number
  initialTab?:    string
}) {
  const [tab, setTab] = useState(initialTab ?? 'descripcion')
  return (
    <Tabs
      items={[
        { key: 'descripcion', label: 'Descripción' },
        { key: 'pagina', label: 'Página' },
        { key: 'openhouse', label: 'Open house', badge: openHouseCount },
      ]}
      value={tab}
      onChange={setTab}
      content={{ descripcion, pagina, openhouse: openHouse }}
    />
  )
}
