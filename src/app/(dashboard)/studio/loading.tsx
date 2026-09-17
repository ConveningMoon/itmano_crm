import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

// Estudio: pestañas, formulario de receta a la izquierda y biblioteca de
// imágenes a la derecha.
export default function StudioLoading() {
  return (
    <>
      <PageHeaderSkeleton width="120px" />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <Skeleton w="90px" h={30} r={8} />
        <Skeleton w="110px" h={30} r={8} />
      </div>
      <div className="max-md:!grid-cols-1" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)', gap: '20px' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton w="100px" h={10} r={3} />
              <Skeleton w="100%" h={34} r={8} />
            </div>
          ))}
          <Skeleton w="100%" h={36} r={8} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', alignContent: 'start' }}>
          {[...Array(8)].map((_, i) => <Skeleton key={i} w="100%" h={160} r={10} />)}
        </div>
      </div>
    </>
  )
}
