import { Skeleton } from '@/components/ui/skeleton'

// Piezas compartidas por los loading.tsx del dashboard. Todas las páginas abren
// con el mismo encabezado (título + bajada) y casi todas siguen con una tira de
// KPIs o una lista, así que la forma se define una vez acá en vez de repetirse
// en cada ruta.

/** Título + bajada — el bloque con el que abre toda página del dashboard. */
export function PageHeaderSkeleton({ width = '200px' }: { width?: string }) {
  return (
    <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Skeleton w={width} h={20} r={4} />
      <Skeleton w="260px" h={12} r={3} />
    </div>
  )
}

// Clases literales: Tailwind escanea el código fuente, así que una clase armada
// por interpolación (`md:grid-cols-${n}`) nunca llega a generarse.
const COLS: Record<number, string> = {
  3: 'grid grid-cols-2 md:grid-cols-3 gap-4',
  4: 'grid grid-cols-2 md:grid-cols-4 gap-4',
  5: 'grid grid-cols-2 md:grid-cols-5 gap-4',
}

/** Tira de tarjetas de KPI. */
export function StatCardsSkeleton({ count = 4 }: { count?: 3 | 4 | 5 }) {
  return (
    <div className={COLS[count]} style={{ marginBottom: '24px' }}>
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '12px', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}
        >
          <Skeleton w="90px" h={10} r={3} />
          <Skeleton w="50%" h={26} r={4} />
        </div>
      ))}
    </div>
  )
}

/** Tarjeta con cabecera y filas — sirve para feeds, listas y tablas simples. */
export function ListCardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Skeleton w="130px" h={12} r={3} />
      </div>
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          style={{
            padding: '14px 20px',
            borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
            display: 'flex', alignItems: 'center', gap: '12px',
          }}
        >
          <Skeleton w="28px" h={28} r={50} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton w={`${45 + ((i * 7) % 35)}%`} h={12} r={3} />
            <Skeleton w="120px" h={10} r={3} />
          </div>
          <Skeleton w="70px" h={10} r={3} />
        </div>
      ))}
    </div>
  )
}
