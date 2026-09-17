import { Skeleton } from '@/components/ui/skeleton'

// Formulario de nueva edición (columna única de 560px, igual que la página).
export default function NewEditionLoading() {
  return (
    <div style={{ maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="200px" h={20} r={4} />
        <Skeleton w="300px" h={12} r={3} />
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton w="110px" h={10} r={3} />
            <Skeleton w="100%" h={i === 1 ? 96 : 34} r={8} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Skeleton w="140px" h={34} r={8} />
        </div>
      </div>
    </div>
  )
}
