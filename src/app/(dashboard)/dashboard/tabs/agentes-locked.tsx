import Link from 'next/link'

// Adelanto estático de la vista de equipo para planes sin ella (Esencial/Growth).
// No lee la base: la pestaña existe, pero los datos son de Partner.
export function AgentesLocked() {
  return (
    <div
      role="status"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', padding: '24px', maxWidth: '640px',
      }}
    >
      <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        La vista de equipo es del plan Partner
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
        Compara el desempeño de cada agente: leads asignados, respuesta, avance por etapa y
        actividad del equipo. Disponible con varios agentes en el plan Partner.
      </p>
      <Link href="/settings" className="btn btn-ghost">Cambiar de plan</Link>
    </div>
  )
}
