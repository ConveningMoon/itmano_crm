import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton, StatCardsSkeleton } from '@/components/ui/page-skeleton'

export default function SourcesLoading() {
  return (
    <>
      <PageHeaderSkeleton width="220px" />
      <StatCardsSkeleton count={4} />

      {/* Pestañas de tipo + ventana de tiempo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', height: '40px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px' }}>
          {['54px', '96px', '70px', '92px', '86px'].map((w, i) => <Skeleton key={i} w={w} h={12} r={3} />)}
        </div>
        <Skeleton w="170px" h={32} r={10} />
      </div>

      {/* La lista es una tabla de filas (no tarjetas): el esqueleto imita esa
          forma para que no haya un salto de layout al llegar los datos. */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px', height: '40px', padding: '0 20px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '28px' }}>
        {['70px', '54px', '48px', '86px', '48px', '72px'].map((w, i) => <Skeleton key={i} w={w} h={10} r={3} />)}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px',
            minHeight: '64px', padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <Skeleton w="42%" h={13} r={4} />
              <Skeleton w="28%" h={10} r={3} />
            </div>
            <Skeleton w="150px" h={20} r={10} />
            <Skeleton w="34px" h={13} r={3} />
            <Skeleton w="48px" h={13} r={3} />
            <Skeleton w="34px" h={13} r={3} />
            <Skeleton w="44px" h={13} r={3} />
            <Skeleton w="32px" h={32} r={8} />
          </div>
        ))}
      </div>
    </>
  )
}
