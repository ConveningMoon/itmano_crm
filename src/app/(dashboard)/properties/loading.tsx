import { Skeleton } from '@/components/ui/skeleton'

export default function PropertiesLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <Skeleton w="160px" h={20} r={6} style={{ marginBottom: '6px' }} />
          <Skeleton w="100px" h={14} r={4} />
        </div>
        <Skeleton w="130px" h={36} />
      </div>

      {/* Filter tabs skeleton */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[90, 100, 100, 80].map((w, i) => (
          <Skeleton key={i} w={`${w}px`} h={32} />
        ))}
      </div>

      {/* Cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Skeleton w="180px" h={16} r={4} />
              <Skeleton w="72px" h={20} r={10} />
            </div>
            <Skeleton w="120px" h={13} r={4} />
            <div style={{ display: 'flex', gap: '8px' }}>
              {[70, 60, 70].map((w, j) => (
                <Skeleton key={j} w={`${w}px`} h={13} r={4} />
              ))}
            </div>
            <Skeleton w="100px" h={13} r={4} />
          </div>
        ))}
      </div>
    </>
  )
}
