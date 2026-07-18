'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'

// Tabs del detalle de propiedad: Descripción (datos + editar) | Página
// (constructor / embebible / solicitud). Server content llega como props.
export function PropertyDetailTabs({ descripcion, pagina }: { descripcion: React.ReactNode; pagina: React.ReactNode }) {
  const [tab, setTab] = useState('descripcion')
  return (
    <Tabs
      items={[{ key: 'descripcion', label: 'Descripción' }, { key: 'pagina', label: 'Página' }]}
      value={tab}
      onChange={setTab}
      content={{ descripcion, pagina }}
    />
  )
}
