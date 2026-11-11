import { Skeleton } from '@/components/ui/skeleton'

// Forma de la lista de propiedades mientras llega: pestañas de estado con las
// acciones a la derecha y la rejilla de tarjetas con portada. Lo usan
// loading.tsx y el Suspense de la página.
export function PropertiesListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando propiedades">
      <div className="toolbar">
        <div className="toolbar-group">
          {[70, 96, 96, 82].map((w, i) => <Skeleton key={i} w={`${w}px`} h={28} r={6} />)}
        </div>
        <div className="toolbar-group">
          <Skeleton w="118px" h={34} r={8} />
          <Skeleton w="146px" h={34} r={8} />
        </div>
      </div>

      <div className="prop-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="prop-card prop-card-static">
            <div className="prop-cover" />
            <div className="prop-card-body">
              <div className="prop-card-top">
                <div className="settings-stack settings-stack-tight">
                  <Skeleton w="180px" h={15} r={4} />
                  <Skeleton w="110px" h={12} r={3} />
                </div>
                <Skeleton w="72px" h={22} r={11} />
              </div>
              <Skeleton w="120px" h={20} r={4} />
              <Skeleton w="160px" h={12} r={3} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
