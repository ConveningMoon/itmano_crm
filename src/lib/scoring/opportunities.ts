// Oportunidades que el lead declara sin querer.
//
// El scoring mide QUÉ TAN BUENO es un lead para la operación en la que está.
// Pero algunas respuestas del formulario revelan una operación DISTINTA, y esa
// no cabe en el score: no hace mejor al lead, abre otro negocio.
//
// El caso que motivó esto: un comprador con contingencia (`con_contingencia`)
// tiene que vender su casa actual antes de comprar. El modelo le resta 10 —
// correcto, la compra puede caerse — y ahí se acababa la historia. Pero esa
// persona ES un lead de venta: tiene una propiedad, un motivo y una fecha. Para
// una inmobiliaria son dos comisiones, no media.
//
// Deliberadamente NO suma puntos. La calidad responde "¿qué tan bueno es este
// lead?"; sumarle por una segunda operación mezclaría dos preguntas y ensuciaría
// la banda. Esto se muestra donde el agente decide qué hacer, que es donde sirve.
//
// Módulo PURO: sólo lee `fit_profile`, ninguna dependencia de Supabase.

export interface LeadOpportunity {
  /** Clave estable, para filtros o métricas futuras. */
  key:   string
  label: string
  /** Qué hacer con esto, en una línea. */
  hint:  string
}

type FitProfile = Record<string, unknown> | null | undefined

function bucket(profile: FitProfile, dimension: string): string | null {
  if (!profile || typeof profile !== 'object') return null
  const raw = (profile as Record<string, unknown>)[dimension]
  return typeof raw === 'string' ? raw : null
}

/**
 * Oportunidades derivadas del fit declarado. Hoy sólo una; la forma admite más
 * sin tocar a quien las pinta.
 */
export function opportunitiesFor(fitProfile: FitProfile): LeadOpportunity[] {
  const out: LeadOpportunity[] = []

  if (bucket(fitProfile, 'contingency') === 'con_contingencia') {
    out.push({
      key:   'listing_potencial',
      label: 'También tiene una propiedad que vender',
      hint:  'Su compra depende de esa venta: llevarla tú destraba el trato y suma una segunda operación.',
    })
  }

  return out
}
