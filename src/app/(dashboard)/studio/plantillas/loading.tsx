import { Skeleton } from '@/components/ui/skeleton'

// Editor de plantillas: lista de diseños, código y vista previa.
export default function TemplatesLoading() {
  return (
    <div className="max-md:!grid-cols-1" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) minmax(0, 1fr)', gap: '16px' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[...Array(8)].map((_, i) => <Skeleton key={i} w="100%" h={28} r={6} />)}
      </div>
      <Skeleton w="100%" h={520} r={12} />
      <Skeleton w="100%" h={520} r={12} />
    </div>
  )
}
