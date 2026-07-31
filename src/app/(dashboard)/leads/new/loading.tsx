import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

export default function NewLeadLoading() {
  return (
    <>
      <PageHeaderSkeleton width="180px" />
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', padding: '20px', maxWidth: '720px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton w="90px" h={10} r={3} />
              <Skeleton w="100%" h={34} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton w="90px" h={10} r={3} />
              <Skeleton w="100%" h={34} />
            </div>
          </div>
        ))}
        <Skeleton w="160px" h={34} />
      </div>
    </>
  )
}
