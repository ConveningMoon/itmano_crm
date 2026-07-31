import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

export default function CarouselsLoading() {
  return (
    <>
      <PageHeaderSkeleton width="220px" />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[110, 90, 100].map((w, i) => (
          <Skeleton key={i} w={`${w}px`} h={30} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: '12px', overflow: 'hidden',
            }}
          >
            <Skeleton w="100%" h={160} r={0} />
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton w="70%" h={12} r={3} />
              <Skeleton w="45%" h={10} r={3} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
