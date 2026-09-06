import { Skeleton } from '@/components/ui/skeleton'

export default function EmailsLoading() {
  return (
    <>
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="200px" h={20} r={4} />
        <Skeleton w="280px" h={12} r={3} />
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '12px', overflow: 'hidden', marginBottom: '16px',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Skeleton w="32px" h={32} r={8} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton w="180px" h={14} r={4} />
              <Skeleton w="120px" h={10} r={3} />
            </div>
          </div>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ marginBottom: '10px' }}><Skeleton w="60px" h={10} r={3} /></div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['140px', '120px', '130px', '110px'].map((w, j) => (
                <Skeleton key={j} w={w} h={26} r={6} />
              ))}
            </div>
          </div>
          <div style={{ padding: '12px 20px', display: 'flex', gap: '24px' }}>
            <Skeleton w="80px" h={12} r={3} />
            <Skeleton w="80px" h={12} r={3} />
            <Skeleton w="80px" h={12} r={3} />
          </div>
        </div>
      ))}
    </>
  )
}
