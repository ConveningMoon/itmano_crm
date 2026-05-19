function Skeleton({ w, h, r = 8 }: { w: string; h: number; r?: number }) {
  return (
    <div style={{
      width: w,
      height: `${h}px`,
      borderRadius: `${r}px`,
      background: 'var(--bg-elevated)',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  )
}

export default function ChannelDetailLoading() {
  return (
    <>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ marginBottom: '20px' }}>
        <Skeleton w="160px" h={14} r={4} />
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Skeleton w="260px" h={22} r={4} />
        <Skeleton w="180px" h={12} r={3} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ marginBottom: '10px' }}><Skeleton w="90px" h={10} r={3} /></div>
            <Skeleton w="50px" h={24} r={4} />
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <Skeleton w="140px" h={14} r={4} />
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[...Array(4)].map((_, j) => (
                <div key={j} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Skeleton w="80px" h={12} r={3} />
                  <Skeleton w="20px" h={12} r={3} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <Skeleton w="180px" h={14} r={4} />
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} w="100%" h={20} r={4} />
          ))}
        </div>
      </div>
    </>
  )
}
