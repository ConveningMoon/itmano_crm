import { Skeleton } from '@/components/ui/skeleton'
import { ListCardSkeleton, StatCardsSkeleton } from '@/components/ui/page-skeleton'

// /newsletters prepara el canal y la secuencia antes de leer ediciones y
// estadísticas: son varias olas de consultas. Forma real de lo que llega:
// acciones, tira de totales y tabla de ediciones. Lo usan loading.tsx y el
// Suspense de la página.
export function NewslettersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando newsletter">
      <div className="toolbar">
        <Skeleton w="80px" h={12} r={3} />
        <div className="toolbar-group">
          <Skeleton w="118px" h={34} r={8} />
          <Skeleton w="132px" h={34} r={8} />
        </div>
      </div>
      <StatCardsSkeleton count={4} />
      <ListCardSkeleton rows={6} />
    </div>
  )
}
