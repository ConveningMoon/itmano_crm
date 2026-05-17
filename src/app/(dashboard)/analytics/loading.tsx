function Skeleton({ w, h, r = 8 }: { w: string; h: number; r?: number }) {
  return (
    <div style={{
      width: w, height: `${h}px`, borderRadius: `${r}px`,
      background: 'var(--bg-elevated)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )
}

export default function AnalyticsLoading() {
  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Skeleton w="80px" h={10} r={3} />
              <Skeleton w="34px" h={34} r={8} />
            </div>
            <Skeleton w="60%" h={26} r={4} />
            <Skeleton w="50%" h={10} r={3} />
          </div>
        ))}
      </div>

      {/* Donut + Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
            <Skeleton w="120px" h={14} r={4} />
            <Skeleton w="180px" h={10} r={3} style={{ marginTop: '6px', marginBottom: '16px' }} />
            <Skeleton w="100%" h={200} r={8} />
          </div>
        ))}
      </div>

      {/* Area chart */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <Skeleton w="140px" h={14} r={4} />
        <Skeleton w="220px" h={10} r={3} style={{ marginTop: '6px', marginBottom: '16px' }} />
        <Skeleton w="100%" h={220} r={8} />
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
            <Skeleton w="120px" h={14} r={4} />
            <Skeleton w="180px" h={10} r={3} style={{ marginTop: '6px', marginBottom: '16px' }} />
            <Skeleton w="100%" h={180} r={8} />
          </div>
        ))}
      </div>
    </div>
  )
}
