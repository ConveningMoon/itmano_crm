import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

export default function SourcesLoading() {
  return (
    <>
      <PageHeaderSkeleton width="120px" />

      {/* Pestañas de tipo (izquierda) y búsqueda (derecha) en una sola fila */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', height: '40px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', overflow: 'hidden', minWidth: 0 }}>
          {['54px', '96px', '70px', '92px', '86px'].map((w, i) => <Skeleton key={i} w={w} h={12} r={3} />)}
        </div>
        <div className="hidden md:block"><Skeleton w="220px" h={34} r={8} /></div>
      </div>

      {/* La lista es una tabla de filas: el esqueleto imita su forma (cuadro de
          icono, nombre y meta, salud, tendencia, cifras y acciones) para que no
          haya un salto de layout al llegar los datos. */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px', height: '40px', padding: '0 20px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '28px' }}>
        {['60px', '54px', '48px', '44px', '40px'].map((w, i) => <Skeleton key={i} w={w} h={10} r={3} />)}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '16px',
            minHeight: '64px', padding: '12px 20px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
          }}>
            <Skeleton w="34px" h={34} r={10} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
              <Skeleton w="42%" h={13} r={4} />
              <Skeleton w="28%" h={10} r={3} />
            </div>
            <div className="hidden md:flex items-center gap-4">
              <Skeleton w="110px" h={12} r={3} />
              <Skeleton w="72px" h={20} r={4} />
            </div>
            <Skeleton w="34px" h={13} r={3} />
            <div className="hidden md:block"><Skeleton w="34px" h={13} r={3} /></div>
            <Skeleton w="44px" h={32} r={8} />
          </div>
        ))}
      </div>
    </>
  )
}
