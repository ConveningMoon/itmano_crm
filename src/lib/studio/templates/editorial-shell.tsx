import { Headline, StatRow, AgentBadge, Icon, ICONS, textColors, splitWhen } from './primitives'
import type { TemplateProps } from './types'

// ── Editorial, versión 2 ─────────────────────────────────────────────────────
//
// La versión anterior repartía el lienzo en cuatro franjas de alto FIJO. Con
// eso, cada receta que tenía menos que contar dejaba un hueco: casa abierta no
// tiene specs, un cierre no tiene cifra, un evento puede no tener foto. Se
// parcheó dos veces moviendo constantes y volvió a pasar, porque el problema no
// era el reparto sino que hubiera un reparto fijo.
//
// Aquí solo hay DOS alturas fijas —la foto y el pie— y el bloque de color se
// queda con todo lo que sobre. Un hueco es imposible: si la receta trae poco
// texto, el bloque no se encoge, se centra dentro de su espacio.
//
// El elemento flexible es el bloque de color y no la foto a propósito: satori
// no escala imágenes de fondo (`background-size: cover` se ignora) y una `<img>`
// necesita alto explícito, así que lo único que puede estirarse de verdad es un
// div de color.
//
// Reparto: foto arriba, bloque de color en medio, pie CLARO. El pie es claro
// porque ahí va el logo, y el logo se tiñe con el color de marca — sobre el
// bloque de color desaparecería.

const FOOTER_H   = 180
const AGENT_SIZE = 200

/**
 * Cuánto lienzo se lleva la foto, según cuánto texto traiga la receta.
 *
 * Un cierre publica tres cosas y una venta seis. Con una altura única, la
 * receta corta dejaba medio lienzo de color liso alrededor de tres líneas —el
 * mismo defecto de antes, solo que teñido. Cuanto menos hay que leer, más
 * grande es la foto.
 */
function photoHeight(blocks: number): number {
  if (blocks <= 3) return 700
  if (blocks <= 5) return 600
  return 520
}

export function EditorialPiece(p: TemplateProps) {
  const { onBrand } = textColors(p.palette)
  const { day, time } = splitWhen(p.when)

  const PHOTO_H = photoHeight(
    [p.badge, p.headline, p.price ?? day, p.address, p.stats.length ? 'stats' : null, p.cta]
      .filter(Boolean).length,
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={PHOTO_H} alt="" style={{ objectFit: 'cover', flexShrink: 0 }} />
      )}

      {/* Bloque de color: TODO el texto. Se queda con lo que la foto y el pie
          dejen libre, y centra su contenido dentro de ese espacio. */}
      <div style={{
        display: 'flex', flexDirection: 'column', flexGrow: 1, width: 1080,
        backgroundColor: p.palette.brand, justifyContent: 'center',
        paddingLeft: 70, paddingRight: 70, paddingTop: 50, paddingBottom: 50,
      }}>
        {p.badge && (
          <span style={{ fontFamily: 'Marcellus', fontSize: 32, letterSpacing: 10, color: onBrand }}>{p.badge}</span>
        )}

        <div style={{ display: 'flex', marginTop: 20 }}>
          <Headline text={p.headline} color={onBrand} size={56} />
        </div>

        {/* El dato por el que se publica: la cifra en una venta, la fecha en
            una casa abierta o un evento. Nunca los dos. */}
        {p.price && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 68, color: onBrand, marginTop: 20 }}>
            {p.price}
          </span>
        )}
        {!p.price && day && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 48, color: onBrand, marginTop: 20 }}>
            {day}
          </span>
        )}
        {!p.price && time && (
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 40, color: onBrand, marginTop: 4 }}>
            {time}
          </span>
        )}

        {p.address && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
            <Icon path={ICONS.pin} color={onBrand} size={32} />
            <span style={{ fontFamily: 'Spectral', fontSize: 30, color: onBrand, marginLeft: 14 }}>{p.address}</span>
          </div>
        )}

        {p.stats.length > 0 && (
          <div style={{ display: 'flex', marginTop: 20 }}>
            <StatRow stats={p.stats} color={onBrand} />
          </div>
        )}

        {p.cta && (
          <span style={{ fontFamily: 'Spectral', fontSize: 26, color: onBrand, opacity: 0.85, marginTop: 18 }}>
            {p.cta}
          </span>
        )}
      </div>

      {/* Pie claro: el agente y el logo. Con portada, el texto arranca después
          de ella — el círculo monta sobre el pie y la cara queda junto al
          nombre, en vez de apoyada en el borde como si no hubiera cabido. */}
      <div style={{
        display: 'flex', flexShrink: 0, width: 1080, height: FOOTER_H,
        backgroundColor: p.palette.surface, alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: p.agentPhoto ? 70 + AGENT_SIZE + 30 : 70, paddingRight: 70,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {p.agentName && (
            <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 38, color: p.palette.ink }}>{p.agentName}</span>
          )}
          {p.phone && (
            <span style={{ fontFamily: 'Marcellus', fontSize: 28, letterSpacing: 3, color: p.palette.ink, marginTop: 6 }}>{p.phone}</span>
          )}
        </div>

        {p.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
          <img src={p.logo} width={110} height={110} alt="" style={{ objectFit: 'contain' }} />
        )}
      </div>

      {p.agentPhoto && (
        <AgentBadge src={p.agentPhoto} size={AGENT_SIZE} ring={p.palette.surface} left={70} bottom={FOOTER_H - 74} />
      )}
    </div>
  )
}
