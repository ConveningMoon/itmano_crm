import { Skeleton } from '@/components/ui/skeleton'

export default function LeadMagnetsLoading() {
  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="140px" h={20} r={4} />
        <Skeleton w="220px" h={12} r={3} />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="100px" h={10} r={3} />
              <Skeleton w="32px" h={32} r={8} />
            </div>
            <Skeleton w="50%" h={28} r={4} />
          </div>
        ))}
      </div>

      {/* LM cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="80px" h={20} r={4} />
              <Skeleton w="60px" h={20} r={4} />
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton w="80%" h={15} r={4} />
              <Skeleton w="60%" h={12} r={3} />
              <Skeleton w="40%" h={10} r={3} style={{ marginBottom: '8px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                {[...Array(4)].map((_, j) => (
                  <div key={j} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
                    <Skeleton w="40px" h={18} r={3} />
                    <Skeleton w="60px" h={10} r={3} style={{ marginTop: '4px' }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="60px" h={14} r={3} />
              <Skeleton w="70px" h={28} r={6} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
