// Preguntas de calificación de una página alojada.
//
// El constructor de formularios del CRM dejaba la clave como texto libre, así
// que un tenant que se armaba su formulario aquí dentro nunca casaba con el
// vocabulario de fit: escribía `pregunta_1` y el motor no puntuaba nada. Fit 0
// para siempre, sin ningún aviso.
//
// La idea es que el tenant NO elija buckets ni puntos — sólo decide "pregunta
// por el presupuesto", y el CRM escribe las opciones con SUS números. Por eso la
// pregunta guarda únicamente la dimensión: las opciones se derivan al renderizar.
// Si mañana cambia sus rangos en Ajustes → Tu negocio, el formulario se corrige
// solo. No hay nada que sincronizar porque no hay nada duplicado.
//
// Módulo PURO y client-safe: lo comparten el constructor, la página pública y el
// prompt de integración.

import {
  hasBudgetBands, formatMoney, type BusinessProfile,
} from '@/lib/business/profile'

export type HostedLang = 'es' | 'en' | 'pt'

/** Las dimensiones que el constructor sabe ofrecer (camino de compra). */
export const QUALIFYING_DIMENSIONS = [
  'timeline', 'financing', 'budget_amount', 'area', 'agent_status', 'contingency',
] as const
export type QualifyingDimension = typeof QUALIFYING_DIMENSIONS[number]

export interface DerivedOption { value: string; label: string }

export interface QualifyingQuestion {
  dimension: QualifyingDimension
  /** El texto que ve el visitante. */
  label:     string
  options:   DerivedOption[]
}

/** Por qué una dimensión no se puede ofrecer todavía. Null = disponible. */
export type UnavailableReason = 'sin_rangos' | 'sin_zonas' | null

type L = Record<HostedLang, string>
const t = (es: string, en: string, pt: string): L => ({ es, en, pt })

const QUESTION_TEXT: Record<QualifyingDimension, L> = {
  timeline:      t('¿Cuándo planeas comprar?', 'When are you planning to buy?', 'Quando você planeja comprar?'),
  financing:     t('¿En qué etapa estás con el financiamiento?', 'Where are you in the financing process?', 'Em que etapa você está no financiamento?'),
  budget_amount: t('¿Cuál es tu presupuesto aproximado?', "What's your approximate budget?", 'Qual é o seu orçamento aproximado?'),
  area:          t('¿En qué zona buscas?', 'Which area are you looking in?', 'Em qual região você procura?'),
  agent_status:  t('¿Ya trabajas con un agente?', 'Are you already working with an agent?', 'Você já trabalha com um corretor?'),
  contingency:   t('¿Necesitas vender otra propiedad antes de comprar?', 'Do you need to sell another property first?', 'Você precisa vender outro imóvel antes?'),
}

/** El texto por defecto de cada pregunta, en español (el constructor es en español). */
export const DIMENSION_QUESTION_TEXT: Record<QualifyingDimension, string> =
  Object.fromEntries(QUALIFYING_DIMENSIONS.map(d => [d, QUESTION_TEXT[d].es])) as Record<QualifyingDimension, string>

/** Nombre corto de la dimensión para el constructor (lo lee el tenant, no el visitante). */
export const DIMENSION_PICKER_LABEL: Record<QualifyingDimension, string> = {
  timeline:      'Cuándo compra',
  financing:     'Cómo lo financia',
  budget_amount: 'Presupuesto',
  area:          'Zona',
  agent_status:  'Si ya tiene agente',
  contingency:   'Si necesita vender antes',
}

// Las opciones de estas cuatro son el vocabulario del modelo: fijas, porque los
// buckets son universales. Las otras dos salen del perfil de la agencia.
const FIXED_OPTIONS: Partial<Record<QualifyingDimension, Array<{ value: string; label: L }>>> = {
  timeline: [
    { value: 'under_3_months',     label: t('En los próximos 3 meses', 'In the next 3 months', 'Nos próximos 3 meses') },
    { value: '3_6_months',         label: t('En 3 a 6 meses', 'In 3 to 6 months', 'Em 3 a 6 meses') },
    { value: '6_12_months',        label: t('En 6 a 12 meses', 'In 6 to 12 months', 'Em 6 a 12 meses') },
    { value: 'over_12_explorando', label: t('Aún estoy explorando', 'Just exploring for now', 'Ainda estou pesquisando') },
  ],
  financing: [
    { value: 'cash',        label: t('Pago al contado', 'Paying in cash', 'Pago à vista') },
    { value: 'preapproved', label: t('Ya tengo preaprobación', 'I already have a pre-approval', 'Já tenho pré-aprovação') },
    { value: 'in_process',  label: t('En trámite con un prestamista', 'In process with a lender', 'Em processo com um credor') },
    { value: 'not_started', label: t('Aún no he empezado', "Haven't started yet", 'Ainda não comecei') },
  ],
  agent_status: [
    { value: 'sin_agente', label: t('No, estoy buscando', "No, I'm looking", 'Não, estou procurando') },
    { value: 'con_agente', label: t('Sí, ya tengo uno', 'Yes, I have one', 'Sim, já tenho um') },
  ],
  contingency: [
    { value: 'sin_contingencia', label: t('No', 'No', 'Não') },
    { value: 'con_contingencia', label: t('Sí', 'Yes', 'Sim') },
  ],
}

const NO_SE: L = t('Aún no lo sé', 'Not sure yet', 'Ainda não sei')
const OTRA_ZONA: L = t('Otra zona', 'Another area', 'Outra região')

/**
 * Si la dimensión se puede ofrecer con el perfil actual.
 *
 * El presupuesto y la zona dependen de datos que sólo la agencia tiene. Sin
 * ellos la pregunta no se ofrece — en vez de ofrecerla rota y que el tenant
 * descubra meses después que no puntuaba.
 */
export function unavailableReason(d: QualifyingDimension, p: BusinessProfile): UnavailableReason {
  if (d === 'budget_amount' && !hasBudgetBands(p)) return 'sin_rangos'
  if (d === 'area' && p.primaryAreas.length === 0 && p.secondaryAreas.length === 0) return 'sin_zonas'
  return null
}

export const UNAVAILABLE_HINT: Record<Exclude<UnavailableReason, null>, string> = {
  sin_rangos: 'Define tus rangos de presupuesto en Ajustes → Tu negocio y esta pregunta se arma sola.',
  sin_zonas:  'Declara las zonas que atiendes en Ajustes → Tu negocio y esta pregunta se arma sola.',
}

/**
 * Las opciones de una dimensión, ya resueltas contra el perfil de la agencia.
 * Devuelve `null` si el perfil todavía no permite construirla.
 */
export function optionsFor(
  d: QualifyingDimension, p: BusinessProfile, lang: HostedLang,
): DerivedOption[] | null {
  if (unavailableReason(d, p)) return null

  const fijas = FIXED_OPTIONS[d]
  if (fijas) return fijas.map(o => ({ value: o.value, label: o.label[lang] }))

  if (d === 'budget_amount') {
    // Los tres tramos SON los de la agencia. El visitante ve dinero; lo que
    // viaja es el monto, y el CRM lo clasifica con estos mismos cortes — así el
    // nivel nunca puede discrepar de lo que el formulario ofreció.
    const bajo = formatMoney(p.budgetEntryMax, p.currency)
    const alto = formatMoney(p.budgetPremiumMin, p.currency)
    return [
      { value: String(p.budgetEntryMax), label: lang === 'en' ? `Up to ${bajo}` : lang === 'pt' ? `Até ${bajo}` : `Hasta ${bajo}` },
      { value: `${p.budgetEntryMax}-${p.budgetPremiumMin}`, label: `${bajo} – ${alto}` },
      { value: String(p.budgetPremiumMin), label: lang === 'en' ? `More than ${alto}` : lang === 'pt' ? `Mais de ${alto}` : `Más de ${alto}` },
      // Sin monto parseable el CRM no deriva bucket, que es justo lo que
      // significa "no lo sé". No resta: simplemente no declara nada.
      { value: 'no_definido', label: NO_SE[lang] },
    ]
  }

  // area: las zonas declaradas, tal cual. El valor viaja en palabras porque el
  // CRM las compara contra esas mismas cadenas.
  const zonas = [...p.primaryAreas, ...p.secondaryAreas]
  return [
    ...zonas.map(z => ({ value: z, label: z })),
    { value: 'otra', label: OTRA_ZONA[lang] },
  ]
}

/**
 * Resuelve las preguntas guardadas contra el perfil de HOY.
 *
 * Las libres pasan tal cual. Las de calificación se rellenan con las opciones
 * derivadas; si el perfil dejó de permitirlas (borraron los rangos) se OMITEN en
 * vez de renderizarse vacías — un select sin opciones sería una trampa para el
 * visitante y un dato basura para el CRM.
 */
export interface ResolvableQuestion {
  key:           string
  label:         string
  type:          'text' | 'select'
  options?:      string[]
  optionLabels?: string[]
  required:      boolean
  dimension?:    QualifyingDimension
}

export function resolveQuestions<Q extends ResolvableQuestion>(
  questions: Q[], profile: BusinessProfile, lang: HostedLang,
): Q[] {
  const out: Q[] = []
  for (const q of questions) {
    if (!q.dimension) { out.push(q); continue }
    const resuelta = qualifyingQuestion(q.dimension, profile, lang, q.label)
    if (!resuelta) continue
    out.push({
      ...q,
      key:          q.dimension,
      label:        resuelta.label,
      type:         'select' as const,
      options:      resuelta.options.map(o => o.value),
      optionLabels: resuelta.options.map(o => o.label),
    })
  }
  return out
}

/** La pregunta completa, lista para renderizar. `null` si el perfil no alcanza. */
export function qualifyingQuestion(
  d: QualifyingDimension, p: BusinessProfile, lang: HostedLang, customLabel?: string,
): QualifyingQuestion | null {
  const options = optionsFor(d, p, lang)
  if (!options) return null
  return { dimension: d, label: customLabel?.trim() || QUESTION_TEXT[d][lang], options }
}
