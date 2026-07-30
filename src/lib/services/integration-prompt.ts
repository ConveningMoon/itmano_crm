import 'server-only'
import { FIT_DIMENSIONS } from './intake-fit'

export interface FitCatalogEntry {
  dimension:  string
  matchValue: string
  label:      string
}

export type IntegrationChannelType = 'lead_magnet' | 'event' | 'contact_form'

export interface IntegrationPromptInput {
  channelType:    IntegrationChannelType
  channelName:    string
  publicId:       string
  tenantName:     string
  baseUrl:        string
  contactSecret?: string
  fitCatalog:     FitCatalogEntry[]
}

const CHANNEL_TYPE_LABEL: Record<IntegrationChannelType, string> = {
  lead_magnet:  'Lead Magnet',
  event:        'Evento',
  contact_form: 'Formulario',
}

const INTENT_GROUPS: Array<{ label: string; dimensions: readonly string[] }> = [
  { label: 'Intención "buy" / "invest"', dimensions: FIT_DIMENSIONS.buy },
  { label: 'Intención "sell"',           dimensions: FIT_DIMENSIONS.sell },
]

// Arma la sección de form_answers + tabla de fit. Vacío si no hay catálogo
// (nunca deja un encabezado sin contenido debajo).
function buildFitSection(fitCatalog: FitCatalogEntry[]): string {
  if (fitCatalog.length === 0) return ''

  const byDimension = new Map<string, FitCatalogEntry[]>()
  for (const entry of fitCatalog) {
    const list = byDimension.get(entry.dimension) ?? []
    list.push(entry)
    byDimension.set(entry.dimension, list)
  }

  const groupLines: string[] = []
  for (const group of INTENT_GROUPS) {
    const dimsPresent = group.dimensions.filter(d => byDimension.has(d))
    if (dimsPresent.length === 0) continue
    groupLines.push(`${group.label}:`)
    for (const dim of dimsPresent) {
      const values = (byDimension.get(dim) ?? []).map(e => e.matchValue).join(' | ')
      groupLines.push(`  - ${dim.padEnd(16)} → ${values}`)
    }
    groupLines.push('')
  }
  if (groupLines.length === 0) return ''

  return [
    '### form_answers — cómo el CRM reconoce cada respuesta',
    'Arreglo de objetos, uno por pregunta respondida:',
    '{ "key": "...", "question": "texto de la pregunta", "value": "código interno", "label": "texto legible" }',
    '',
    'Puedes mandar cualquier pregunta con cualquier `key` — se guarda y se muestra',
    'en el CRM tal cual. Pero si preguntas presupuesto, tiempos, financiamiento o si',
    'ya tiene agente, usa EXACTAMENTE estas claves y códigos para que además sumen',
    'puntaje automático (otro `key`/valor se guarda igual, pero no puntúa):',
    '',
    ...groupLines,
  ].join('\n').trimEnd()
}

function buildViewSnippet(baseUrl: string, publicId: string): string {
  const fence = '```'
  return [
    '### Métricas de vistas (opcional, recomendado)',
    'Sin esto, "Vistas" y "Conversión" de este canal quedan en 0. Dispara esto en',
    'cada carga de página (no bloquea, no espera respuesta):',
    '',
    `${fence}html`,
    '<script>',
    '(function(){',
    "  var d = {v: localStorage.getItem('_itm_vid') || (function(){",
    "    var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;",
    '  })()};',
    `  navigator.sendBeacon('${baseUrl}/api/intake/${publicId}/view', JSON.stringify(d));`,
    '})();',
    '</script>',
    fence,
  ].join('\n')
}

// Solo contact_form: Webflow sigue siendo una integración real (ver
// api/webhooks/webflow/[publicId]/route.ts, que referencia el formulario real
// de A&J), separada de la narrativa "pega esto en tu IA" porque no necesita
// código ni IA — solo pegar una URL en un ajuste de Webflow. El secret de ese
// mecanismo sigue siendo el fallback global (fuera de alcance de este
// diseño), por eso no se imprime ningún valor.
function buildWebflowFootnote(baseUrl: string, publicId: string): string {
  return [
    '### ¿Usas Webflow? (sin código, sin IA)',
    'Si tu sitio está en Webflow y usas su formulario nativo, no necesitas nada de lo',
    'anterior: en Site Settings → Forms → Webhooks, apunta el formulario "Contact Us" a',
    `POST ${baseUrl}/api/webhooks/webflow/${publicId}`,
    'Webflow firma cada envío con HMAC — pide el secret vigente a ITMANO.',
  ].join('\n')
}

export function buildIntegrationPrompt(input: IntegrationPromptInput): string {
  const { channelType, channelName, publicId, tenantName, baseUrl, contactSecret, fitCatalog } = input
  const typeLabel = CHANNEL_TYPE_LABEL[channelType]
  const fence = '```'

  const lines: string[] = [
    `Estoy integrando un formulario web con el CRM de ITMANO para ${tenantName}.`,
    'Sigue este contrato exactamente — es todo lo que el CRM necesita para',
    'reconocer cada respuesta.',
    '',
    '### Canal',
    `${channelName} (${typeLabel}) · ID público: ${publicId}`,
    '',
  ]

  if (channelType === 'contact_form') {
    lines.push(
      '### Endpoint recomendado (sin autenticación, se puede llamar desde el navegador)',
      `POST ${baseUrl}/api/intake/${publicId}/submit`,
      'Content-Type: application/json',
      'CORS abierto (`Access-Control-Allow-Origin: *`). Protegido por ID no',
      'adivinable + honeypot + validación de schema, no por origen.',
      '',
      '### Alternativa autenticada (solo si llamas desde TU backend, nunca desde JS de navegador)',
      `POST ${baseUrl}/api/contact/${publicId}/submit`,
      `Header: x-contact-secret: ${contactSecret ?? '(pídelo desde "Ver Opciones de integración")'}`,
      'Sin CORS — un fetch directo desde el navegador fallará. Esta ruta no alimenta',
      'el scoring automático de fit (sección de abajo) — solo el análisis de IA en',
      'texto libre.',
      '',
    )
  } else {
    lines.push(
      '### Endpoint',
      `POST ${baseUrl}/api/intake/${publicId}/submit`,
      'Content-Type: application/json',
      'CORS abierto (`Access-Control-Allow-Origin: *`). Protegido por ID no',
      'adivinable + honeypot + validación de schema, no por origen. Se puede llamar',
      'directo desde el navegador o desde tu backend.',
      '',
    )
  }

  lines.push(
    '### Cuerpo (JSON)',
    `${fence}json`,
    '{',
    '  "first_name": "string, requerido",',
    '  "last_name":  "string, opcional",',
    '  "email":      "string, requerido, formato email",',
    '  "phone":      "string, opcional",',
    '  "language":   "es | en | pt, opcional (default es)",',
    '  "intent":     "buy | sell | invest, opcional — activa el scoring de fit de abajo",',
    '  "source_url": "string, opcional",',
    '  "website":    "SIEMPRE vacío (honeypot anti-spam)",',
    '  "form_answers": []',
    '}',
    fence,
    '',
  )

  const fitSection = buildFitSection(fitCatalog)
  if (fitSection) lines.push(fitSection, '')

  lines.push(
    '### Respuesta y qué dispara',
    `${fence}json`,
    '{ "ok": true, "status": "created" | "already_submitted" }',
    fence,
    'Mismo email + mismo tenant = mismo lead (se actualiza, nunca se duplica).',
  )
  if (channelType === 'lead_magnet') {
    lines.push('El envío inscribe automáticamente al lead en la secuencia de email de este canal.')
  } else if (channelType === 'event') {
    lines.push('Cada registro dispara notificación y scoring de `event_submission` (+20).')
  } else {
    lines.push('Cada envío dispara notificación de contacto en el CRM (bell + Telegram).')
  }
  lines.push('', buildViewSnippet(baseUrl, publicId), '')

  if (channelType === 'contact_form') {
    lines.push(buildWebflowFootnote(baseUrl, publicId), '')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export async function getFitCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  tenantId: string,
): Promise<FitCatalogEntry[]> {
  const { data, error } = await db
    .from('lead_score_rules')
    .select('tenant_id, dimension, match_value, label')
    .eq('category', 'fit')
    .eq('is_active', true)
    .not('match_value', 'is', null)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)

  if (error) {
    console.error(JSON.stringify({ service: 'integration-prompt', fn: 'getFitCatalog', error: error.message }))
  }

  type Row = { tenant_id: string | null; dimension: string; match_value: string; label: string | null }
  const byKey = new Map<string, FitCatalogEntry & { isTenantSpecific: boolean }>()
  for (const row of (data ?? []) as Row[]) {
    const key = `${row.dimension}::${row.match_value}`
    const isTenantSpecific = row.tenant_id === tenantId
    const existing = byKey.get(key)
    if (!existing || (isTenantSpecific && !existing.isTenantSpecific)) {
      byKey.set(key, {
        dimension:  row.dimension,
        matchValue: row.match_value,
        label:      row.label ?? row.match_value,
        isTenantSpecific,
      })
    }
  }
  return [...byKey.values()].map(({ dimension, matchValue, label }) => ({ dimension, matchValue, label }))
}
