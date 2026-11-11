import { Skeleton } from '@/components/ui/skeleton'

// Forma del detalle de la propiedad mientras llega: identidad con miniatura,
// pestañas y las dos columnas (textos | ficha), una sola en pantallas
// estrechas. Lo usan loading.tsx y el Suspense de la página.
export function PropertyDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando propiedad">
      <div className="back-link"><Skeleton w="110px" h={13} r={4} /></div>
      <div className="page-header">
        <div className="lead-identity">
          <Skeleton w="96px" h={72} r={10} />
          <div className="settings-stack settings-stack-tight">
            <Skeleton w="240px" h={20} r={4} />
            <Skeleton w="180px" h={12} r={3} />
          </div>
        </div>
        <div className="page-actions">
          <Skeleton w="150px" h={34} r={8} />
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-group">
          {[96, 70, 104].map((w, i) => <Skeleton key={i} w={`${w}px`} h={30} r={6} />)}
        </div>
      </div>

      <div className="lead-detail-grid">
        <div className="lead-col">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="settings-card settings-stack settings-stack-tight">
              <Skeleton w="90px" h={12} r={3} />
              {[...Array(4)].map((_, j) => <Skeleton key={j} w="100%" h={14} r={3} />)}
            </div>
          ))}
        </div>
        <div className="lead-col">
          <div className="settings-card settings-stack settings-stack-tight">
            <Skeleton w="70px" h={14} r={4} />
            {[...Array(6)].map((_, j) => <Skeleton key={j} w="100%" h={22} r={4} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
