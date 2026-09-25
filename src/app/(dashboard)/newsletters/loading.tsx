import { Skeleton } from '@/components/ui/skeleton'
import { ListCardSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from '@/components/ui/page-skeleton'

// /newsletters prepara el canal y la secuencia antes de leer ediciones y
// estadísticas: son varias olas de consultas y sin este esqueleto el clic en el
// nav no daba ninguna señal hasta que llegaba la página entera.
export default function NewslettersLoading() {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <PageHeaderSkeleton width="160px" />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton w="120px" h={32} r={8} />
          <Skeleton w="140px" h={32} r={8} />
        </div>
      </div>
      <StatCardsSkeleton count={4} />
      <ListCardSkeleton rows={6} />
    </>
  )
}
