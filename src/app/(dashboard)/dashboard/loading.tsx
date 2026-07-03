import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div style={{ padding: '24px' }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Skeleton w="60%" h={12} />
            <Skeleton w="40%" h={32} />
            <Skeleton w="50%" h={10} />
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <Skeleton w="140px" h={14} r={4} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} w="76px" h={60} r={4} />
          ))}
        </div>
      </div>

      {/* Bottom panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px' }}>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton w="140px" h={14} r={4} />
          {[...Array(5)].map((_, i) => <Skeleton key={i} w="100%" h={44} r={8} />)}
        </div>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton w="120px" h={14} r={4} />
          {[...Array(6)].map((_, i) => <Skeleton key={i} w="100%" h={36} r={8} />)}
        </div>
      </div>
    </div>
  )
}
