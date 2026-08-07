import 'server-only'
import { FIT_DIMENSIONS } from './intake-fit'
import { optionsFor, QUALIFYING_DIMENSIONS, type QualifyingDimension } from '@/lib/hosted-questions'
import { formatMoney, hasBudgetBands, EMPTY_PROFILE, type BusinessProfile } from '@/lib/business/profile'

export interface FitCatalogEntry {
  dimension:  string
  matchValue: string
  label:      string
  /** Puntos de la regla vigente — sirven para mostrar qué fit produce el ejemplo. */
  points:     number
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
  /** Perfil de negocio vigente. Sin él el prompt cae a la versión genérica. */
  profile?:       BusinessProfile
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
    '### Presupuesto y zona: manda el dato, no el nivel',
    'Estas dos claves son la alternativa recomendada a `budget_tier` y `geo_fit`.',
    'Tu formulario no puede saber si 300.000 es mucho o poco para esta agencia, ni',
    'qué zonas atiende — eso está configurado en el CRM. Manda el dato en bruto y',
    'el CRM lo clasifica contra los rangos y las zonas de la agencia:',
    '',
    '  - budget_amount   → el monto, número o texto ("350000", "$350,000", "300k-400k")',
    '  - area            → la zona en palabras ("Virginia Beach", "Chesapeake, VA")',
    '',
    'Si mandas las dos formas, gana el dato en bruto. Si la agencia todavía no ha',
    'configurado sus rangos o sus zonas, la dimensión se queda sin determinar (no',
    'se le inventa un nivel al lead).',
  ].join('\n').trimEnd()
}


// ── Lo que esta agencia decidió, con sus números ──────────────────────────────
//
// Antes el prompt describía el contrato en abstracto: "manda budget_amount y el
// CRM lo clasifica". Cierto, pero un integrador no puede comprobar que lo hizo
// bien. Aquí van los cortes y las zonas VIGENTES, un envío de ejemplo construido
// con ellos, y el fit que produciría — la consecuencia, no sólo la forma.
//
// Se genera en cada lectura, así que cambiar el perfil en Ajustes cambia este
// texto sin que nadie lo regenere a mano.
function buildProfileSection(profile: BusinessProfile, fitCatalog: FitCatalogEntry[]): string {
  const lineas: string[] = ['### La configuración ACTUAL de esta agencia']

  if (hasBudgetBands(profile)) {
    lineas.push(
      `Rangos de presupuesto: hasta ${formatMoney(profile.budgetEntryMax, profile.currency)} es "entry",`,
      `desde ${formatMoney(profile.budgetPremiumMin, profile.currency)} es "premium", en medio "mid".`,
      'Manda `budget_amount` con el monto y el CRM aplica estos cortes. Si los cambia,',
      'tu formulario NO necesita cambiar.',
    )
  } else {
    lineas.push('Rangos de presupuesto: sin configurar — `budget_amount` no clasificará nada todavía.')
  }

  const zonas = [...profile.primaryAreas, ...profile.secondaryAreas]
  if (zonas.length > 0) {
    lineas.push(
      '',
      `Zonas declaradas — principal: ${profile.primaryAreas.join(', ') || '(ninguna)'};`,
      `secundaria: ${profile.secondaryAreas.join(', ') || '(ninguna)'}.`,
      'Manda `area` con la zona EN PALABRAS. Ofrece EXACTAMENTE estas zonas en tu',
      'formulario: cualquier otra cuenta como fuera de zona y le RESTA puntos al lead.',
    )
  } else {
    lineas.push('', 'Zonas: sin declarar — `area` no clasificará nada todavía.')
  }

  // Ejemplo con las opciones que la propia configuración genera.
  const ejemplo: Array<{ key: string; question: string; value: string; label: string }> = []
  let fit = 0
  const puntosDe = (dim: string, val: string) =>
    fitCatalog.find(e => e.dimension === dim && e.matchValue === val)?.points ?? 0

  for (const d of QUALIFYING_DIMENSIONS as readonly QualifyingDimension[]) {
    const opciones = optionsFor(d, profile, 'es')
    if (!opciones?.length) continue
    const elegida = opciones[0] // la mejor opción de cada dimensión
    ejemplo.push({ key: d, question: `(tu pregunta sobre ${d})`, value: elegida.value, label: elegida.label })
    // `budget_amount` y `area` no puntúan por sí mismos: puntúa el bucket que el
    // CRM deriva de ellos. La primera opción es siempre la mejor de su lista.
    if (d === 'budget_amount')  fit += puntosDe('budget_tier', 'entry')
    else if (d === 'area')      fit += puntosDe('geo_fit', 'zona_principal')
    else                        fit += puntosDe(d, elegida.value)
  }

  if (ejemplo.length > 0) {
    const fence = '```'
    lineas.push(
      '',
      '### Envío de ejemplo, con TU configuración',
      `${fence}json`,
      JSON.stringify({
        first_name: 'María', last_name: 'Gómez', email: 'maria@ejemplo.com',
        phone: '+1 757 555 0100', language: 'es', intent: 'buy',
        website: '', form_answers: ejemplo,
      }, null, 2),
      fence,
      `Ese envío da un fit de ${fit} puntos con las reglas de hoy. Si tu formulario`,
      'manda algo distinto y el fit sale 0, es que las claves o los valores no coinciden.',
    )
  }

  return lineas.join(String.fromCharCode(10))
}

function buildViewSnippet(baseUrl: string, publicId: string): string {
  const fence = '```'
  return [
    '### Medición de vistas (OBLIGATORIO — no es opcional)',
    'Sin esto, "Vistas" y "Conversión" de este canal quedan en 0 PARA SIEMPRE, y el',
    'CRM no puede decirte si el problema está en el tráfico o en el formulario: ve',
    'los envíos, pero no cuánta gente llegó a la página y no la llenó.',
    '',
    'ANTES DE TERMINAR, verifica que la página ya lo tenga. Si ya carga intake.js',
    'con un atributo data-channel, ya está — no lo dupliques.',
    '',
    '#### Forma RECOMENDADA: servirlo desde TU dominio (first-party)',
    'Cargar el script desde otro dominio parece más simple, pero falla en silencio',
    'en tres escenarios reales, y los tres dejan las vistas en cero sin ningún',
    'error visible:',
    '',
    '  1. Es el patrón exacto de un rastreador (script de un tercero que manda',
    '     datos a ese tercero). Chrome en Android, Safari con ITP, Brave y',
    '     cualquier bloqueador lo cortan por defecto.',
    '  2. Bot-check / protección anti-DDoS del otro dominio: desde una IP de VPN,',
    '     compartida o de un país filtrado, responde un reto HTML en vez de',
    '     ejecutar la ruta. Un beacon no puede resolver un reto.',
    '  3. CORS: cualquier respuesta inesperada y el navegador descarta el envío.',
    '',
    'Se evitan los tres haciendo que TODO salga por tu propio dominio. En Next.js,',
    'en next.config.ts:',
    '',
    `${fence}ts`,
    'async rewrites() {',
    '  return [',
    `    { source: "/intake.js",         destination: "${baseUrl}/intake.js" },`,
    `    { source: "/api/intake/:path*", destination: "${baseUrl}/api/intake/:path*" },`,
    '  ]',
    '},',
    fence,
    '',
    'Y el script se carga desde la ruta LOCAL (ojo: `src="/intake.js"`, sin dominio):',
    '',
    `${fence}html`,
    `<script src="/intake.js" data-channel="${publicId}"></script>`,
    fence,
    '',
    'intake.js deriva su base de su propio `src`, así que con esto sus llamadas',
    'salen solas por tu dominio. No hay que configurar nada más.',
    '',
    'Si tu sitio no es Next.js, el equivalente es un proxy/rewrite en tu servidor',
    'o CDN para esas dos rutas (nginx, Cloudflare Workers, Netlify redirects…).',
    '',
    '#### Alternativa directa (más simple, pero expuesta a lo de arriba)',
    'Si no puedes configurar un rewrite, cárgalo apuntando al CRM:',
    '',
    `${fence}html`,
    `<script src="${baseUrl}/intake.js" data-channel="${publicId}"></script>`,
    fence,
    '',
    'Funciona, pero perderás las visitas de los visitantes con bloqueador o detrás',
    'de una VPN — y no lo sabrás, porque no da error.',
    '',
    '#### Comprobación (hazla, no la saltes)',
    '  1. Abre en tu navegador la URL del script tal como la cargue la página',
    '     (por ejemplo https://tu-dominio.com/intake.js). Tiene que devolver',
    '     JavaScript. Si devuelve HTML, la ruta está interceptada y NO va a medir.',
    '  2. Abre la página y comprueba en la consola que `window.itmano` existe.',
    '  3. Vuelve al CRM y mira que "Vistas" haya subido. Recargar la misma página',
    '     NO suma otra: se cuenta un visitante distinto por navegador cada 24 h.',
    '',
    'Si entran envíos y las vistas siguen en 0, el panel de Fuentes te lo marcará',
    'como "Sin medición".',
  ].join(String.fromCharCode(10))
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
  const profile = input.profile ?? EMPTY_PROFILE
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
  lines.push(buildProfileSection(profile, fitCatalog), '')

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
    .select('tenant_id, dimension, match_value, label, points')
    .eq('category', 'fit')
    .eq('is_active', true)
    .not('match_value', 'is', null)
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)

  if (error) {
    console.error(JSON.stringify({ service: 'integration-prompt', fn: 'getFitCatalog', error: error.message }))
  }

  type Row = { tenant_id: string | null; dimension: string; match_value: string; label: string | null; points: number | null }
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
        points:     row.points ?? 0,
        isTenantSpecific,
      })
    }
  }
  return [...byKey.values()].map(({ dimension, matchValue, label, points }) => ({ dimension, matchValue, label, points }))
}
