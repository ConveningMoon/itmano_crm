import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

export default function EmailsLoading() {
  return (
    <>
      <PageHeaderSkeleton width="120px" />

      {/* Pestañas: Secuencias / Por etiqueta / De cierre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', height: '40px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
        {['96px', '92px', '70px'].map((w, i) => <Skeleton key={i} w={w} h={12} r={3} />)}
      </div>

      {/* Barra de herramientas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <Skeleton w="96px" h={12} r={3} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton w="124px" h={34} r={8} />
          <Skeleton w="132px" h={34} r={8} />
        </div>
      </div>

      {/* Cabecera + filas de la tabla de secuencias */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px', height: '40px', padding: '0 20px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '28px' }}>
        {['70px', '54px', '54px', '64px', '86px'].map((w, i) => <Skeleton key={i} w={w} h={10} r={3} />)}
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '20px',
            minHeight: '64px', padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              <Skeleton w="38%" h={13} r={4} />
              <Skeleton w="52%" h={10} r={3} />
            </div>
            <Skeleton w="62px" h={22} r={11} />
            <Skeleton w="62px" h={22} r={11} />
            <Skeleton w="44px" h={13} r={3} />
            <Skeleton w="140px" h={24} r={4} />
            <Skeleton w="32px" h={32} r={8} />
          </div>
        ))}
      </div>
    </>
  )
}
