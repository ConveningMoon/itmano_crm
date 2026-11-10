import { Skeleton } from '@/components/ui/skeleton'
import { StatCardsSkeleton } from '@/components/ui/page-skeleton'

// Centro de control mientras llega: KPIs de plataforma, pestañas y la rejilla
// de tarjetas de tenant (una columna en pantallas estrechas). Lo usan
// loading.tsx y el Suspense de la página.
export function AdminSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando centro de control">
      <StatCardsSkeleton count={4} />
      <div className="toolbar-group nl-tabs-skeleton">
        {[80, 90, 70, 80].map((w, i) => <Skeleton key={i} w={`${w}px`} h={30} r={8} />)}
      </div>
      <div className="admin-tenant-grid">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="settings-card settings-stack settings-stack-tight">
            <div className="settings-inline">
              <Skeleton w="36px" h={36} r={8} />
              <Skeleton w="160px" h={15} r={4} />
            </div>
            <Skeleton w="70%" h={12} r={3} />
            <Skeleton w="120px" h={32} r={8} />
          </div>
        ))}
      </div>
    </div>
  )
}
