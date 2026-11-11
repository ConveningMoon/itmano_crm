import { Skeleton } from '@/components/ui/skeleton'

// Forma real del detalle de un open house: encabezado, panel de confirmación
// y tarjetas de correo. Lo usan loading.tsx y el Suspense de la página.
export function OpenHouseDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando open house">
      <div className="back-link"><Skeleton w="140px" h={13} r={4} /></div>

      <div className="page-header">
        <div className="settings-stack settings-stack-tight">
          <Skeleton w="min(340px, 80vw)" h={22} r={4} />
          <Skeleton w="220px" h={13} r={3} />
          <Skeleton w="min(280px, 70vw)" h={18} r={9} />
        </div>
      </div>

      <div className="settings-stack">
        <div className="settings-card settings-stack settings-stack-tight">
          <Skeleton w="160px" h={14} r={4} />
          <Skeleton w="100%" h={12} r={3} />
          <Skeleton w="140px" h={30} r={8} />
        </div>

        <Skeleton w="80px" h={15} r={4} />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="settings-card settings-stack settings-stack-tight">
            <Skeleton w="180px" h={14} r={4} />
            <Skeleton w="min(240px, 70vw)" h={12} r={3} />
            <div className="toolbar-group">
              <Skeleton w="110px" h={30} r={8} />
              <Skeleton w="110px" h={30} r={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
