import { Skeleton } from '@/components/ui/skeleton'

// Editor de edición: formulario a la izquierda y vista previa a la derecha.
export default function EditionLoading() {
  return (
    <>
      <div style={{ marginBottom: '20px' }}><Skeleton w="120px" h={13} r={4} /></div>
      <div className="max-md:!grid-cols-1" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Skeleton w="220px" h={20} r={4} />
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Skeleton w="90px" h={10} r={3} />
              <Skeleton w="100%" h={i === 4 ? 140 : 34} r={8} />
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton w="100%" h={180} r={10} />
          <Skeleton w="70%" h={18} r={4} />
          {[...Array(7)].map((_, i) => <Skeleton key={i} w={`${70 + ((i * 11) % 30)}%`} h={12} r={3} />)}
        </div>
      </div>
    </>
  )
}
