'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Mismo motivo que en /analytics (ver charts/lazy.tsx): recharts es el paquete
// de cliente más grande y este diagrama vive dentro de una pestaña que el
// super_admin puede no abrir. Se carga aparte, con un hueco de su misma altura.
export const AiUsageDailyChart = dynamic(
  () => import('./ai-usage-chart').then(m => m.AiUsageDailyChart),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-label="Cargando gráfico" style={{ width: '100%', height: '240px', display: 'flex', alignItems: 'flex-end', gap: '10px', padding: '12px 0' }}>
        {[0.5, 0.8, 0.6, 0.9, 0.7, 0.55].map((h, i) => (
          <Skeleton key={i} w="100%" h={Math.round(240 * h * 0.8)} r={6} />
        ))}
      </div>
    ),
  },
)
