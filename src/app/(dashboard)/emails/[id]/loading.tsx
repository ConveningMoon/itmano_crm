import { Skeleton } from '@/components/ui/skeleton'

export default function EmailDetailLoading() {
  return (
    <>
      <div style={{ marginBottom: '20px' }}><Skeleton w="140px" h={12} r={3} /></div>
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="260px" h={22} r={4} />
        <Skeleton w="180px" h={12} r={3} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[0, 1, 2].map(i => <Skeleton key={i} w="100%" h={60} r={10} />)}
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} w="100%" h={36} r={6} />)}
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} w="100%" h={40} r={4} />)}
      </div>
    </>
  )
}
