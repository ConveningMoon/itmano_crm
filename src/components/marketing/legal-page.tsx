// Marco compartido de las páginas legales: contenedor angosto, título, fecha
// de actualización y prosa. Server Component — cero JS de cliente.

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="mk-container" style={{ maxWidth: '760px', paddingTop: '132px', paddingBottom: '96px' }}>
      <style>{`
        .mk-legal h2 {
          font-size: 18px; font-weight: 500; color: var(--text-primary);
          margin-top: 40px; margin-bottom: 12px; letter-spacing: -0.01em;
        }
        .mk-legal p, .mk-legal li {
          font-size: 14px; line-height: 1.7; color: var(--text-secondary);
        }
        .mk-legal p { margin-bottom: 14px; }
        .mk-legal ul { margin: 0 0 14px 18px; display: flex; flex-direction: column; gap: 8px; }
        .mk-legal strong { color: var(--text-primary); font-weight: 500; }
        .mk-legal a { color: var(--accent-gold); text-decoration: none; }
        .mk-legal a:hover { text-decoration: underline; }
      `}</style>
      <span className="mk-eyebrow">Legal</span>
      <h1 className="mk-h2" style={{ marginTop: '14px' }}>{title}</h1>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
        Última actualización: {updated}
      </p>
      <div className="mk-legal" style={{ marginTop: '32px' }}>
        {children}
      </div>
    </div>
  )
}
