import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <>
      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="140px" h={20} r={4} />
        <Skeleton w="200px" h={12} r={3} />
      </div>

      {/* Tab bar skeleton */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px', paddingBottom: '8px' }}>
        {['140px', '80px', '120px'].map((w, i) => (
          <Skeleton key={i} w={w} h={14} r={3} />
        ))}
      </div>

      {/* Card skeleton */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Skeleton w="160px" h={14} r={4} />
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i}>
              <div style={{ marginBottom: '6px' }}><Skeleton w="100px" h={10} r={3} /></div>
              <Skeleton w="60%" h={32} r={8} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
