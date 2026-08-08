// Lo que ve un tenant mientras el Estudio sigue cerrado. No es un cartel de
// "en construcción": enumera lo que va a poder hacer, con la especificidad
// suficiente para que se entienda que ya existe.

const RECIPES = [
  { title: 'Casa abierta',     body: 'Fecha, horario y dirección sobre una escena que invita a entrar.' },
  { title: 'Nueva disponible', body: 'La fachada como protagonista, con el precio y los metros en su sitio.' },
  { title: 'Vendida',          body: 'El cierre anunciado con tu marca, muestres o no la cifra.' },
  { title: 'Evento',           body: 'Seminarios y encuentros, con el lugar y cómo registrarse.' },
]

export function StudioTeaser() {
  return (
    <div style={{ maxWidth: '760px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
        Estudio
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 28px' }}>
        Imágenes de marketing con tu marca, generadas desde el CRM. Disponible pronto para tu equipo.
      </p>

      <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {RECIPES.map(r => (
          <div
            key={r.title}
            style={{
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {r.title}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.body}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px', lineHeight: 1.6 }}>
        Los datos de cada pieza salen de tus propiedades, así que la dirección y el precio
        nunca se escriben dos veces. Cuando se habilite, lo verás aquí mismo.
      </p>
    </div>
  )
}
