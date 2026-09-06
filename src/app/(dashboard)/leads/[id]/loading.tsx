import { Skeleton } from '@/components/ui/skeleton'

export default function LeadDetailLoading() {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}><Skeleton w="120px" h={13} r={4} /></div>

      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <Skeleton w="48px" h={48} r={24} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton w="220px" h={20} r={4} />
          <Skeleton w="150px" h={12} r={3} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Skeleton w="140px" h={14} r={4} />
              {[...Array(3)].map((_, j) => <Skeleton key={j} w="100%" h={16} r={4} />)}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Skeleton w="120px" h={13} r={4} />
              <Skeleton w="60px" h={28} r={6} />
              {[...Array(3)].map((_, j) => <Skeleton key={j} w="100%" h={12} r={3} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
