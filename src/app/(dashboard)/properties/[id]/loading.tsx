import { Skeleton } from '@/components/ui/skeleton'

export default function PropertyDetailLoading() {
  return (
    <>
      <div style={{ marginBottom: '20px' }}><Skeleton w="120px" h={13} r={4} /></div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
        <Skeleton w="120px" h={90} r={10} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Skeleton w="260px" h={22} r={4} />
          <Skeleton w="180px" h={13} r={3} />
        </div>
      </div>

      {/* Fact cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Skeleton w="70px" h={10} r={3} />
            <Skeleton w="50px" h={20} r={4} />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Skeleton w="160px" h={14} r={4} />
        {[...Array(4)].map((_, j) => <Skeleton key={j} w="100%" h={14} r={3} />)}
      </div>
    </>
  )
}
