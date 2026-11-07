import { Skeleton } from '@/components/ui/skeleton'

// Forma del formulario de alta mientras llega: pestañas y tarjetas de campos.
// Lo usan loading.tsx y el Suspense de la página.
export function NewLeadFormSkeleton() {
  return (
    <div className="form-narrow settings-stack" aria-busy="true" aria-label="Cargando formulario">
      <div className="settings-inline">
        <Skeleton w="130px" h={36} r={8} />
        <Skeleton w="150px" h={36} r={8} />
      </div>
      {[3, 1, 1].map((fields, i) => (
        <div key={i} className="settings-card settings-stack settings-stack-tight">
          <Skeleton w="120px" h={14} r={4} />
          {[...Array(fields)].map((_, j) => (
            <div key={j} className="settings-stack settings-stack-tight">
              <Skeleton w="90px" h={10} r={3} />
              <Skeleton w="100%" h={36} r={9} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
