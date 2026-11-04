import { Skeleton } from '@/components/ui/skeleton'
import { GeneralSkeleton } from './tab-skeletons'

export default function DashboardLoading() {
  return (
    <div>
      {/* Barra de pestañas */}
      <div style={{ display: 'flex', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', padding: '10px 0' }}>
        {[...Array(5)].map((_, i) => <Skeleton key={i} w="72px" h={16} r={4} style={{ marginRight: '14px' }} />)}
      </div>
      <GeneralSkeleton />
    </div>
  )
}
