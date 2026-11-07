import { Skeleton } from '@/components/ui/skeleton'

// Forma del detalle del lead mientras llega: identidad y las dos columnas de
// tarjetas (una sola en pantallas estrechas, como la página real). Lo usan
// loading.tsx y el Suspense de la página.
export function LeadDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando lead">
      <div className="back-link"><Skeleton w="120px" h={13} r={4} /></div>
      <div className="page-header">
        <div className="lead-identity">
          <Skeleton w="48px" h={48} r={24} />
          <div className="settings-stack settings-stack-tight">
            <Skeleton w="220px" h={20} r={4} />
            <Skeleton w="150px" h={12} r={3} />
          </div>
        </div>
        <div className="page-actions">
          <Skeleton w="132px" h={34} r={8} />
          <Skeleton w="34px" h={34} r={8} />
          <Skeleton w="34px" h={34} r={8} />
        </div>
      </div>

      <div className="lead-detail-grid">
        <div className="lead-col">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="settings-card settings-stack settings-stack-tight">
              <Skeleton w="140px" h={14} r={4} />
              {[...Array(3)].map((_, j) => <Skeleton key={j} w="100%" h={16} r={4} />)}
            </div>
          ))}
        </div>
        <div className="lead-col">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="settings-card settings-stack settings-stack-tight">
              <Skeleton w="120px" h={13} r={4} />
              <Skeleton w="60px" h={28} r={6} />
              {[...Array(3)].map((_, j) => <Skeleton key={j} w="100%" h={12} r={3} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
