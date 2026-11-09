import { Skeleton } from '@/components/ui/skeleton'

// Formulario de nueva edición (columna única de 560px, igual que la página).
// Lo usan loading.tsx y el Suspense de la página.
export function NewEditionSkeleton() {
  return (
    <div className="nl-new" aria-busy="true" aria-label="Cargando formulario">
      <div className="back-link"><Skeleton w="110px" h={13} r={4} /></div>
      <div className="page-header">
        <Skeleton w="160px" h={20} r={4} />
        <div className="page-actions">
          <Skeleton w="132px" h={34} r={8} />
          <Skeleton w="146px" h={34} r={8} />
        </div>
      </div>
      <div className="settings-card settings-stack">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="settings-stack settings-stack-tight">
            <Skeleton w="110px" h={10} r={3} />
            <Skeleton w="100%" h={i === 3 ? 96 : 34} r={8} />
          </div>
        ))}
        <div className="settings-modal-actions">
          <Skeleton w="90px" h={34} r={8} />
          <Skeleton w="120px" h={34} r={8} />
        </div>
      </div>
    </div>
  )
}
