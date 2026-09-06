'use client'

import { useState } from 'react'
import { Tabs } from '@/components/ui/tabs'

// Tabs del detalle de fuente: General (métricas + envíos) | Página (cómo se
// crea la landing del canal). Server content llega como props (patrón lm-tabs).
export function SourceTabs({ general, pagina }: { general: React.ReactNode; pagina: React.ReactNode }) {
  const [tab, setTab] = useState('general')
  return (
    <Tabs
      items={[{ key: 'general', label: 'General' }, { key: 'pagina', label: 'Página' }]}
      value={tab}
      onChange={setTab}
      content={{ general, pagina }}
    />
  )
}
