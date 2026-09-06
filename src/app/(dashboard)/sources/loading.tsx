import { Skeleton } from '@/components/ui/skeleton'

export default function SourcesLoading() {
  return (
    <>
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="200px" h={20} r={4} />
        <Skeleton w="160px" h={12} r={3} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="90px" h={10} r={3} />
              <Skeleton w="32px" h={32} r={8} />
            </div>
            <Skeleton w="50%" h={28} r={4} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="80px" h={20} r={10} />
              <Skeleton w="55px" h={20} r={10} />
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Skeleton w="75%" h={15} r={4} />
              <div style={{ marginBottom: '8px' }}><Skeleton w="45%" h={10} r={3} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
                {[...Array(4)].map((_, j) => (
                  <div key={j} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
                    <Skeleton w="36px" h={18} r={3} />
                    <div style={{ marginTop: '4px' }}><Skeleton w="55px" h={10} r={3} /></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="65px" h={14} r={3} />
              <Skeleton w="80px" h={28} r={6} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
