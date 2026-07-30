import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton, StatCardsSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

export default function EmailAnalyticsLoading() {
  return (
    <div style={{ padding: '24px' }}>
      {/* Volver a Analítica */}
      <div style={{ marginBottom: '20px' }}>
        <Skeleton w="110px" h={13} r={3} />
      </div>
      <PageHeaderSkeleton width="190px" />
      <StatCardsSkeleton count={5} />
      <ListCardSkeleton rows={6} />
    </div>
  )
}
