export default function Loading() {
  return (
    <div style={{ maxWidth: '520px', paddingTop: '40px' }}>
      {[100, 200, 320, 240, 80].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? '28px' : i === 4 ? '36px' : '44px',
            width: `${w}px`,
            background: 'var(--bg-elevated)',
            borderRadius: '8px',
            marginBottom: i === 0 ? '28px' : '16px',
            maxWidth: '100%',
          }}
        />
      ))}
    </div>
  )
}
