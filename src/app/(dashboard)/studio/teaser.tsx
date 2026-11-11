// Lo que ve un tenant mientras el Estudio sigue cerrado. No es un cartel de
// "en construcción": enumera lo que va a poder hacer, con la especificidad
// suficiente para que se entienda que ya existe.

const RECIPES = [
  { title: 'Casa abierta',     body: 'Fecha, horario y dirección sobre una escena que invita a entrar.' },
  { title: 'Nueva disponible', body: 'La fachada como protagonista, con el precio y los metros en su sitio.' },
  { title: 'Vendida',          body: 'El cierre anunciado con tu marca, muestres o no la cifra.' },
  { title: 'Evento',           body: 'Seminarios y encuentros, con el lugar y cómo registrarse.' },
]

// Sin título propio: la página pone la cabecera (en /studio, desde el shell).
export function StudioTeaser() {
  return (
    <div className="studio-teaser">
      <p className="settings-note-gold">Disponible pronto para tu equipo.</p>

      <div className="studio-teaser-grid">
        {RECIPES.map(r => (
          <div key={r.title} className="settings-card settings-stack settings-stack-tight">
            <div className="form-card-title">{r.title}</div>
            <p className="settings-note">{r.body}</p>
          </div>
        ))}
      </div>

      <p className="settings-note">
        Los datos de cada pieza salen de tus propiedades, así que la dirección y el precio
        nunca se escriben dos veces. Cuando se habilite, lo verás aquí mismo.
      </p>
    </div>
  )
}
