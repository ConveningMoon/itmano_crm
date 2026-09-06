import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

export default function SoporteLoading() {
  return (
    <>
      <PageHeaderSkeleton width="190px" />
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', padding: '20px', maxWidth: '620px',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <Skeleton w="100%" h={34} />
        <Skeleton w="100%" h={34} />
        <Skeleton w="100%" h={110} />
        <Skeleton w="140px" h={34} />
      </div>
    </>
  )
}
