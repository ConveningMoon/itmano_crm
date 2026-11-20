import { Skeleton } from '@/components/ui/skeleton'
import { StatCardsSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

// Panel de operación mientras llega: KPIs, rejilla de tarjetas de proveedor con
// sus barras y la tabla de clientes. Lo usan loading.tsx y el Suspense de la página.
export function OperacionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando panel de operación" className="settings-stack">
      <StatCardsSkeleton count={4} />
      <Skeleton w="140px" h={17} r={4} />
      <div className="ops-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="settings-card settings-stack settings-stack-tight">
            <Skeleton w="160px" h={15} r={4} />
            {[...Array(3)].map((__, j) => (
              <div key={j} className="settings-stack settings-stack-tight">
                <div className="settings-inline" style={{ justifyContent: 'space-between' }}>
                  <Skeleton w="110px" h={12} r={3} />
                  <Skeleton w="70px" h={12} r={3} />
                </div>
                <Skeleton w="100%" h={4} r={2} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <Skeleton w="110px" h={17} r={4} />
      <ListCardSkeleton rows={4} />
    </div>
  )
}
