import { Skeleton } from '@/components/ui/skeleton'

export default function LeadsLoading() {
  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton w="80px" h={20} r={4} />
          <Skeleton w="160px" h={12} r={4} />
        </div>
        <Skeleton w="140px" h={32} r={8} />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {[240, 160, 160, 160, 160].map((w, i) => (
          <Skeleton key={i} w={`${w}px`} h={34} r={8} />
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{ background: 'var(--bg-elevated)', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '16px' }}>
          {[200, 120, 100, 120, 100, 60, 80].map((w, i) => (
            <Skeleton key={i} w={`${w}px`} h={10} r={3} />
          ))}
        </div>
        {/* Data rows */}
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '200px' }}>
              <Skeleton w="32px" h={32} r={50} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Skeleton w="100px" h={12} r={3} />
                <Skeleton w="80px" h={10} r={3} />
              </div>
            </div>
            <Skeleton w="120px" h={12} r={3} />
            <Skeleton w="80px" h={20} r={4} />
            <Skeleton w="100px" h={12} r={3} />
            <Skeleton w="80px" h={8} r={2} />
            <Skeleton w="40px" h={12} r={3} />
            <Skeleton w="60px" h={12} r={3} />
          </div>
        ))}
      </div>
    </div>
  )
}
