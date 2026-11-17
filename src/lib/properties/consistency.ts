// Coherencia entre la ficha estructurada de una propiedad y su texto.
//
// "Crear con IA" llena los campos y redacta descripción y características a la
// vez, a veces desde partes distintas del PDF. En la auditoría de noviembre de
// 2026 una propiedad salió publicada con Año 1754 y "Built in 1913", 1,488 sqft
// y "Approximately 2,126 square feet", "Garaje 0" y "2-car garage". Esto no
// llama a la IA: busca en el texto las cifras habituales y avisa cuando no
// coinciden con el campo, para que la persona decida antes de guardar.

export interface PropertyFacts {
  year_built?:     number | null
  sqft?:           number | null
  bedrooms?:       number | null
  bathrooms_full?: number | null
  garage_spaces?:  number | null
}

export interface ConsistencyWarning {
  field:   keyof PropertyFacts
  label:   string
  value:   number | null | undefined
  inText:  number
  snippet: string
}

const LABELS: Record<keyof PropertyFacts, string> = {
  year_built:     'Año de construcción',
  sqft:           'Superficie (sqft)',
  bedrooms:       'Habitaciones',
  bathrooms_full: 'Baños completos',
  garage_spaces:  'Garaje (autos)',
}

const num = (s: string) => Number(s.replace(/[,.](?=\d{3}\b)/g, ''))

// Cada patrón devuelve el número mencionado en el texto. Inglés y español,
// que es lo que hoy genera la IA.
const PATTERNS: { field: keyof PropertyFacts; re: RegExp }[] = [
  { field: 'year_built',     re: /\b(?:built in|year built|construida en|construido en|año de construcción:?)\s*(\d{4})\b/gi },
  { field: 'sqft',           re: /\b(\d{1,3}(?:[,.]\d{3})+|\d{3,5})\s*(?:square feet|sq\.? ?ft|sqft|pies cuadrados|ft²)/gi },
  { field: 'bedrooms',       re: /\b(\d{1,2})\s*(?:bedrooms?|beds?|habitaciones|dormitorios|recámaras)\b/gi },
  { field: 'bathrooms_full', re: /\b(\d{1,2})\s*(?:full baths?|full bathrooms?|baños completos)\b/gi },
  { field: 'garage_spaces',  re: /\b(\d)[- ](?:car garage)|\bgaraje (?:independiente )?para (\d) autos?/gi },
]

export function checkPropertyConsistency(facts: PropertyFacts, texts: string[]): ConsistencyWarning[] {
  const corpus = texts.filter(Boolean).join('\n')
  if (!corpus.trim()) return []
  const warnings: ConsistencyWarning[] = []

  for (const { field, re } of PATTERNS) {
    re.lastIndex = 0
    const seen = new Set<number>()
    for (const m of corpus.matchAll(re)) {
      const raw = m.slice(1).find(Boolean)
      if (!raw) continue
      const inText = num(raw)
      if (!Number.isFinite(inText) || seen.has(inText)) continue
      seen.add(inText)
      const value = facts[field]
      // Un campo vacío no es contradicción: sólo avisa si hay un valor distinto.
      // El garaje en 0 sí cuenta: "0" contra "2-car garage" es justo el caso.
      const differs = field === 'garage_spaces'
        ? (value ?? 0) !== inText
        : value !== null && value !== undefined && value !== inText
      if (!differs) continue
      warnings.push({ field, label: LABELS[field], value, inText, snippet: m[0].trim() })
      break
    }
  }
  return warnings
}
