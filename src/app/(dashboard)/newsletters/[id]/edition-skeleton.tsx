import { Skeleton } from '@/components/ui/skeleton'

// Editor de edición, de arriba abajo: cabecera (titular, bajada, estado y
// acciones, portada, firma y ajustes), los bloques del cuerpo y las fuentes.
// Lo usan loading.tsx y el Suspense de la página.
export function EditionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando edición">
      <div className="back-link"><Skeleton w="120px" h={13} r={4} /></div>
      <div className="settings-stack">
        <div className="settings-card settings-stack">
          <div className="settings-inline settings-inline-between">
            <div className="settings-stack settings-stack-tight">
              <Skeleton w="min(420px, 70vw)" h={24} r={4} />
              <Skeleton w="min(300px, 60vw)" h={14} r={3} />
            </div>
            <div className="toolbar-group">
              <Skeleton w="84px" h={22} r={11} />
              <Skeleton w="110px" h={34} r={8} />
            </div>
          </div>
          <Skeleton w="100%" h={160} r={10} />
          <div className="toolbar-group">
            {[150, 150, 120].map((w, i) => <Skeleton key={i} w={`${w}px`} h={34} r={8} />)}
          </div>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="settings-card settings-stack settings-stack-tight">
            <Skeleton w="120px" h={12} r={3} />
            <Skeleton w="100%" h={i === 0 ? 120 : 72} r={8} />
          </div>
        ))}
      </div>
    </div>
  )
}
