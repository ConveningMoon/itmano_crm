import { Badge, Headline, StatRow, AgentBadge, textColors } from './primitives'
import { rgba } from '../palettes'
import type { StudioTemplate, TemplateProps } from './types'

// Foto completa — la foto manda y el texto vive sobre un degradado en la mitad
// inferior. Para el agente que tiene UNA foto excelente: no hay mosaico que
// llenar ni espacio que justificar.
//
// Los cuatro roles de la paleta tienen aquí un trabajo concreto. Antes no lo
// tenían: el degradado era negro fijo y el texto blanco fijo, así que elegir
// colores no cambiaba nada de este diseño salvo el logo.
//
//   primario   → el degradado que hace legible el texto
//   secundario → el anillo de la portada del agente
//   texto      → todo el texto
//   logo       → el logo (lo tiñe template-props)
//
// La foto va A SANGRE. Hubo un marco del color secundario y se retiró: este
// diseño existe para que UNA foto excelente ocupe el lienzo entero, y un borde
// alrededor le quitaba justamente eso.

/** La portada del agente, la más grande de los tres diseños: aquí no compite
 *  con miniaturas ni con un bloque de color. */
const AGENT_SIZE = 209

function Render(p: TemplateProps) {
  // El texto va sobre el degradado, que es del color primario.
  const { onPhoto: ink } = textColors(p.palette)
  // Con portada del agente el bloque se estrecha: el círculo ocupa la derecha y
  // una dirección larga acabaría cortada por debajo de él.
  const textWidth = p.agentPhoto ? 700 : 860

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: 1080, height: 1350,
      backgroundColor: p.palette.surface, position: 'relative',
    }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={1350} alt=""
             style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
      )}

      {/* Degradado: lo que hace legible el texto sobre una foto que nadie
          controló. Los tramos están calculados contra dónde EMPIEZA el bloque de
          texto (~56% del alto), no repartidos a ojo: con una rampa suave desde el
          42% el titular caía sobre la parte clara de la fachada y se perdía.
          El color es el primario del tenant, no negro. */}
      <div style={{
        display: 'flex', position: 'absolute', top: 0, left: 0, width: 1080, height: 1350,
        backgroundImage: `linear-gradient(to bottom, ${rgba(p.palette.brand, 0)} 28%, ${rgba(p.palette.brand, 0.55)} 52%, ${rgba(p.palette.brand, 0.85)} 70%, ${rgba(p.palette.brand, 0.97)} 100%)`,
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 50, right: 50, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 100, left: 70, width: textWidth }}>
        <Badge text={p.badge} color={ink} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Headline text={p.headline} color={ink} size={66} />
        </div>
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 76, color: ink, marginTop: 20 }}>
            {p.price}
          </span>
        )}
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: ink, marginTop: 12 }}>{p.address}</span>
        )}
        <div style={{ display: 'flex', marginTop: 22 }}>
          <StatRow stats={p.stats} color={ink} />
        </div>
        {p.agentName && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 24, letterSpacing: 3, color: ink, marginTop: 24 }}>
            {[p.agentName, p.phone].filter(Boolean).join('  ·  ')}
          </span>
        )}
      </div>

      {/* El anillo es lo que pinta el color secundario en este diseño: es el
          único borde que queda, y el que separa la cara del agente del fondo. */}
      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} right={70} bottom={120} />}
    </div>
  )
}

export const completaListing: StudioTemplate = {
  key: 'completa-listing',
  label: 'Foto completa',
  hint: 'Una foto excelente',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 1,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.price'],
    optional: ['photo.agent', 'stats', 'text.address', 'text.phone', 'logo.tenant'],
  },
  render: Render,
}
