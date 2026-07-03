export default function PropertiesLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ width: '160px', height: '20px', background: 'var(--bg-elevated)', borderRadius: '6px', marginBottom: '6px' }} />
          <div style={{ width: '100px', height: '14px', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
        </div>
        <div style={{ width: '130px', height: '36px', background: 'var(--bg-elevated)', borderRadius: '8px' }} />
      </div>

      {/* Filter tabs skeleton */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[90, 100, 100, 80].map((w, i) => (
          <div key={i} style={{ width: `${w}px`, height: '32px', background: 'var(--bg-elevated)', borderRadius: '8px' }} />
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
              <div style={{ width: '180px', height: '16px', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
              <div style={{ width: '72px', height: '20px', background: 'var(--bg-elevated)', borderRadius: '10px' }} />
            </div>
            <div style={{ width: '120px', height: '13px', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              {[70, 60, 70].map((w, j) => (
                <div key={j} style={{ width: `${w}px`, height: '13px', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
              ))}
            </div>
            <div style={{ width: '100px', height: '13px', background: 'var(--bg-elevated)', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    </>
  )
}
