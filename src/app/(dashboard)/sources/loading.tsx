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

      {/* La lista es una tabla de filas (no tarjetas): el esqueleto imita esa
          forma para que no haya un salto de layout al llegar los datos. */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px 20px', marginBottom: '10px', display: 'flex', gap: '24px' }}>
        {['70px', '54px', '48px', '48px', '86px', '48px', '72px', '62px'].map((w, i) => (
          <Skeleton key={i} w={w} h={10} r={3} />
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px',
            padding: '14px 20px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              <Skeleton w="42%" h={13} r={4} />
              <Skeleton w="28%" h={10} r={3} />
            </div>
            <Skeleton w="62px" h={18} r={10} />
            <Skeleton w="120px" h={18} r={10} />
            <Skeleton w="34px" h={13} r={3} />
            <Skeleton w="34px" h={13} r={3} />
            <Skeleton w="34px" h={13} r={3} />
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 1, 2, 3].map(j => <Skeleton key={j} w="28px" h={28} r={6} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
