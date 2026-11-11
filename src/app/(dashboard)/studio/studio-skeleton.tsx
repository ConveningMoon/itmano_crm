import { Skeleton } from '@/components/ui/skeleton'

// Estudio: acciones, pestañas, formulario de receta a la izquierda y
// biblioteca de imágenes a la derecha (una columna en pantallas estrechas).
// Lo usan loading.tsx y el Suspense de la página.
export function StudioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando estudio">
      <div className="toolbar">
        <Skeleton w="150px" h={12} r={3} />
        <Skeleton w="120px" h={34} r={8} />
      </div>
      <div className="toolbar-group nl-tabs-skeleton">
        <Skeleton w="90px" h={30} r={8} />
        <Skeleton w="110px" h={30} r={8} />
      </div>
      <div className="studio-grid">
        <div className="settings-card settings-stack">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="settings-stack settings-stack-tight">
              <Skeleton w="100px" h={10} r={3} />
              <Skeleton w="100%" h={34} r={8} />
            </div>
          ))}
          <Skeleton w="100%" h={36} r={8} />
        </div>
        <div className="studio-library-skeleton">
          {[...Array(8)].map((_, i) => <Skeleton key={i} w="100%" h={160} r={10} />)}
        </div>
      </div>
    </div>
  )
}
