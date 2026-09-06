// Ejemplo del análisis que el agente encuentra al abrir un lead. Estático y
// server-rendered: es una muestra del producto, no una demostración animada.
// Los datos son ficticios — nunca un lead real de un tenant.

const BRIEFING = {
  name: 'Mariana G.',
  source: 'Guía "Vender en Hampton Roads"',
  when: 'Llamar hoy',
  read:
    'Vende para mudarse a una casa más grande antes de que empiece el colegio. Ya tiene la aprobación del banco; lo que la frena es no saber en cuánto se vende la suya.',
  action:
    'Llamarla hoy y ofrecerle una valoración de su casa esta semana — es lo único que le falta para decidirse.',
  points: [
    'Dos casas comparables vendidas en su zona este mes.',
    'La valoración no la compromete a listar contigo.',
    'Los plazos reales: de la firma a la mudanza, seis a ocho semanas.',
  ],
  watchOut:
    'Mencionó que un conocido suyo también es agente. Ten lista la razón por la que vale la pena trabajar con tu equipo.',
}

export function BriefingCard() {
  return (
    <div className="mk-briefing">
      <div className="mk-briefing-head">
        <div>
          <p className="mk-briefing-name">{BRIEFING.name}</p>
          <p className="mk-briefing-source">{BRIEFING.source}</p>
        </div>
        <span className="mk-briefing-when">{BRIEFING.when}</span>
      </div>

      <Block label="La lectura">
        <p className="mk-briefing-text">{BRIEFING.read}</p>
      </Block>

      <Block label="Qué hacer ahora">
        <p className="mk-briefing-text">{BRIEFING.action}</p>
      </Block>

      <Block label="Qué mencionar">
        <ul className="mk-briefing-list">
          {BRIEFING.points.map(p => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Block>

      <Block label="Ojo con">
        <p className="mk-briefing-text">{BRIEFING.watchOut}</p>
      </Block>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mk-briefing-block">
      <span className="mk-briefing-label">{label}</span>
      {children}
    </div>
  )
}
