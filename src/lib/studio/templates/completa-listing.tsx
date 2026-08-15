import { Badge, Headline, StatRow, AgentBadge } from './primitives'
import { rgba, readableOn } from '../palettes'
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
//   secundario → el marco que enmarca la foto
//   texto      → todo el texto
//   logo       → el logo (lo tiñe template-props)

/** Ancho del marco. Lo justo para leerse como un borde deliberado y no como un
 *  error de encuadre. */
const FRAME = 26

function Render(p: TemplateProps) {
  const W = 1080 - FRAME * 2
  const H = 1350 - FRAME * 2

  // El texto va sobre el degradado, que es del color primario: si el color de
  // texto elegido no se separa de él —y por defecto son el MISMO hex— la pieza
  // saldría en blanco. Se prefiere el rol pedido y se degrada solo si no se lee.
  const ink = readableOn(p.palette.brand, p.palette.ink, p.palette.surface)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width: 1080, height: 1350,
      backgroundColor: p.palette.surface, position: 'relative',
    }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={W} height={H} alt=""
             style={{ position: 'absolute', top: FRAME, left: FRAME, objectFit: 'cover' }} />
      )}

      {/* Degradado: lo que hace legible el texto sobre una foto que nadie
          controló. Los tramos están calculados contra dónde EMPIEZA el bloque de
          texto (~56% del alto), no repartidos a ojo: con una rampa suave desde el
          42% el titular caía sobre la parte clara de la fachada y se perdía.
          El color es el primario del tenant, no negro. */}
      <div style={{
        display: 'flex', position: 'absolute', top: FRAME, left: FRAME, width: W, height: H,
        backgroundImage: `linear-gradient(to bottom, ${rgba(p.palette.brand, 0)} 28%, ${rgba(p.palette.brand, 0.55)} 52%, ${rgba(p.palette.brand, 0.85)} 70%, ${rgba(p.palette.brand, 0.97)} 100%)`,
      }} />

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={120} height={120} alt=""
             style={{ position: 'absolute', top: 60, right: 60, objectFit: 'contain' }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', bottom: 110, left: 90, width: 800 }}>
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

      {/* El anillo es del color del marco: la portada del agente y el borde de la
          pieza son la misma pieza de diseño. */}
      {p.agentPhoto && <AgentBadge src={p.agentPhoto} size={190} ring={p.palette.surface} right={90} bottom={130} />}
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
