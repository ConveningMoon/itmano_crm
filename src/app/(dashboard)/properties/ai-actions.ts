'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { resolveTargetTenant } from '@/lib/auth/guards'
import { recordAiUsage } from '@/lib/services/ai-usage'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import type { PropertyInput } from './actions'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// ── "Crear con IA" — prefill the property form from a listing PDF ────────────
// The user uploads a flyer / MLS sheet; Claude extracts the facts and drafts the
// bilingual marketing copy. The result only PREFILLS the existing form — the
// property is never created without human review. Photos are NOT extracted (they
// are uploaded by hand in the form).

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB
// User explicitly chose this model (verified current in the Claude API skill).
const MODEL = 'claude-sonnet-5'

// The subset of PropertyInput the model fills. published_to_web is always false
// (set on the client); media (image/gallery/floor_plans) is not AI-extracted.
// Content is generated for the languages the user chose (máx 3).
export type AiPropertyDraft = Pick<
  PropertyInput,
  | 'address' | 'city' | 'state' | 'neighborhood' | 'property_type'
  | 'list_price' | 'bedrooms' | 'bathrooms_full' | 'bathrooms_half'
  | 'sqft' | 'lot_sqft' | 'year_built' | 'garage_spaces' | 'mls_number'
  | 'name' | 'slug'
> & {
  detail_pdf_url: string | null
  content_languages: string[]
  descriptions: Record<string, string>
  features_i18n: Record<string, string[]>
}

export type AiExtractResult =
  | { ok: true; draft: AiPropertyDraft; fields: string[]; warning?: string }
  | { ok: false; error: string }

const PROPERTY_TYPES = ['residential', 'condo', 'townhouse', 'land', 'commercial', 'multifamily'] as const

// Redondeo a 2 cifras significativas. El lote convertido desde acres hereda la
// precisión de la ficha, no la de la calculadora: "0.09 acres" son ~3.900 sqft,
// no 3.920 — un número exacto invita a creer que el PDF lo dice.
function round2sig(n: number): number {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1))
  return Math.round(n / mag) * mag
}

// Acepta las tres formas en que el modelo devuelve una lista, no sólo la del
// esquema: array de strings, array de objetos ({text}/{value}/{label}) y un
// único string con un item por línea. Antes, cualquiera de las dos últimas
// caía en el `else` y salía `[]` — el formulario quedaba sin características y
// nada en el log decía por qué.
function toList(v: unknown): string[] {
  const items: unknown[] = Array.isArray(v)
    ? v
    : (typeof v === 'string' ? v.split(/\r?\n|(?<=\S)\s*[•·]\s*/) : [])
  return items
    .map((x) => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const cand = o.text ?? o.value ?? o.label ?? o.feature
        return typeof cand === 'string' ? cand : ''
      }
      return ''
    })
    .map((x) => x.replace(/^\s*[-–—*•]\s*/, '').trim())
    .filter((x) => x.length > 0)
}

// Regla de estilo por idioma para la copy de marketing.
function langRule(lang: string): string {
  if (lang === 'es') return 'NEUTRAL LATIN AMERICAN SPANISH (no regional idioms). For money use "inversión", never "precio/costo/pago".'
  if (lang === 'pt') return 'BRAZILIAN PORTUGUESE.'
  if (lang === 'en') return 'natural US English.'
  return `${LANGUAGE_CONFIG[lang as keyof typeof LANGUAGE_CONFIG]?.label ?? lang}.`
}

// Tool con propiedades description_<lang>/features_<lang> por cada idioma pedido,
// para que el modelo SIEMPRE genere ambos por idioma (evita el bug de features
// vacías). Se fuerzan como required.
function buildExtractTool(languages: string[]): Anthropic.Tool {
  const langProps: Record<string, unknown> = {}
  const required: string[] = ['property_type', 'lot_sqft_basis']
  for (const l of languages) {
    langProps[`description_${l}`] = { type: 'string', description: `Warm, premium, factual 2–4 sentence listing description written in ${langRule(l)} Only facts from the PDF.` }
    langProps[`features_${l}`] = {
      type: 'array',
      items: { type: 'string', description: 'One selling point as a short noun phrase (2–7 words), no trailing period.' },
      minItems: 3,
      maxItems: 8,
      description: `Selling points of the property, written in ${langRule(l)} Rephrase what the listing states — that is not inventing. NEVER return an empty list: any listing sheet has enough (style, rooms, kitchen/appliances, flooring, roof, heating/cooling, exterior, lot position, parking, outbuildings, schools).`,
    }
    required.push(`description_${l}`, `features_${l}`)
  }
  return {
    name: 'extract_property',
    description: 'Return the structured data for one real-estate listing extracted from the PDF, plus drafted marketing copy in the requested languages.',
    input_schema: {
      type: 'object',
      properties: {
        address:        { type: ['string', 'null'], description: 'Street address only (e.g. "3033 Somme Avenue"). null if absent.' },
        city:           { type: ['string', 'null'] },
        state:          { type: ['string', 'null'], description: 'US state code (e.g. "VA"). null if absent.' },
        neighborhood:   { type: ['string', 'null'], description: 'Neighborhood / subdivision if stated.' },
        property_type:  { type: 'string', enum: PROPERTY_TYPES as unknown as string[], description: 'Best-fit type; default "residential" for single-family homes.' },
        list_price:     { type: ['number', 'null'], description: 'Asking price in USD as a plain number (no symbols).' },
        bedrooms:       { type: ['integer', 'null'] },
        bathrooms_full: { type: ['integer', 'null'], description: 'Number of full bathrooms.' },
        bathrooms_half: { type: ['integer', 'null'], description: 'Number of half bathrooms.' },
        sqft:           { type: ['integer', 'null'], description: 'Interior living area in square feet.' },
        lot_sqft:       { type: ['integer', 'null'], description: 'Lot size in SQUARE FEET, taken ONLY from a lot measurement the document states: square feet, acres (convert: 1 acre = 43,560 sqft) or lot dimensions (front × depth). NEVER derive it from the living area, the price, the property type or the parcel/tax record. null if the document states no lot measurement.' },
        lot_sqft_basis: { type: 'string', enum: ['stated_sqft', 'acres', 'dimensions', 'absent'], description: 'Where lot_sqft came from: "stated_sqft" the document gives square feet; "acres" you converted a stated acreage; "dimensions" you multiplied stated lot dimensions; "absent" the document states no lot measurement — then lot_sqft MUST be null.' },
        year_built:     { type: ['integer', 'null'] },
        garage_spaces:  { type: ['integer', 'null'] },
        mls_number:     { type: ['string', 'null'] },
        name:           { type: ['string', 'null'], description: 'A short, warm marketing name for the listing (e.g. "Oakmont Manor"). Invent a tasteful one from the street/neighborhood if none is given.' },
        slug:           { type: ['string', 'null'], description: 'kebab-case slug derived from name (lowercase, hyphens, ascii only).' },
        ...langProps,
      },
      required,
    },
  }
}

// Qué es una característica y de dónde sale. Vive aparte porque lo usan los dos
// prompts: la extracción completa y la segunda pasada que sólo pide las listas.
const FEATURES_RULES: string[] = [
  'Features (features_<code>) — never leave this list empty:',
  '- A feature is a short phrase naming something concrete the property HAS. Turning a listing field into a readable phrase is REPHRASING, not inventing — it is exactly what is being asked for.',
  '- Take them from the spec grid and the public remarks: architectural style, renovations and their year, kitchen and appliances, extra rooms (pantry, attic, primary suite), flooring, heating / cooling / water heater, roof, siding, foundation, fence, patio / porch / deck, pool, lot position (cul-de-sac, corner, waterfront), parking and garage, outbuildings (shed), HOA amenities, schools, view.',
  '- Ignore the administrative half of the sheet — listing agent and office, phones, MLS dates, lock box, showing instructions, taxes, mortgage, HOA fees, disclosures, owner. None of that is a feature.',
  '- Example: a sheet reading "Exterior Feat: Cul-De-Sac, Patio" / "Appliances: Dishwasher, Microwave, Range-electric, Refrigerator" / "Roof: Asphalt Shingle (2024)" yields "Cul-de-sac location", "Private patio", "Full appliance package", "Roof replaced in 2024".',
  '- Between 3 and 8 items, ordered by what a buyer cares about most. No duplicates, and do not restate bedrooms, bathrooms or square footage — those already have their own fields.',
]

// Segunda pasada. La extracción pide dieciocho campos y redacta en hasta tres
// idiomas de una vez; cuando algo se cae de esa respuesta son siempre las
// listas de características, y el formulario llega sin ellas sin que nada
// falle. Esta llamada tiene un único objetivo, va sin el resto del esquema y
// sólo se paga cuando la primera no las trajo.
function buildFeaturesTool(languages: string[]): Anthropic.Tool {
  const props: Record<string, unknown> = {}
  for (const l of languages) {
    props[`features_${l}`] = {
      type: 'array',
      items: { type: 'string', description: 'One selling point as a short noun phrase (2–7 words), no trailing period.' },
      minItems: 3,
      maxItems: 8,
      description: `Selling points written in ${langRule(l)}`,
    }
  }
  return {
    name: 'list_features',
    description: 'Return the bullet list of selling points for this listing, in each requested language.',
    input_schema: { type: 'object', properties: props, required: languages.map(l => `features_${l}`) },
  }
}

function buildFeaturesPrompt(languages: string[]): string {
  const langList = languages.map(l => `${LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l} (${l})`).join(', ')
  return [
    'Read the attached real-estate listing PDF and list its selling points.',
    `Produce one list per language: ${langList}. The lists must say the same things, each written natively in its language.`,
    '',
    ...FEATURES_RULES,
    '',
    'Call the list_features tool with the result.',
  ].join('\n')
}

function buildPrompt(languages: string[], agencyDescription?: string): string {
  const langList = languages.map(l => `${LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l} (${l})`).join(', ')
  return [
    'Extract the data for this real-estate property listing from the attached PDF.',
    agencyDescription
      ? `\nThe agency that lists this property (use it for tone and market relevance — never invent facts about the property from it):\n${agencyDescription}\n`
      : '',
    'Rules:',
    '- Extract factual fields (address, price, beds, baths, sqft, year, MLS, etc.) ONLY if they appear in the PDF. Never invent numbers or an address. Return null for anything not present.',
    '- If the document is clearly NOT a property listing, set address, list_price, sqft and bedrooms all to null.',
    '- lot_sqft: only from a lot measurement the sheet states (square feet, acres, or lot dimensions). MLS sheets often give it as acreage ("Appx Acres: 0.09") — converting that is correct; report how you got it in lot_sqft_basis. If the sheet gives no lot measurement at all, lot_sqft is null and lot_sqft_basis is "absent" — never fill it from the living area, the price or a guess.',
    `- Write the marketing copy in a warm, premium, trustworthy real-estate tone — calm and specific, no hype, no emojis. Base it strictly on facts in the PDF; do not fabricate amenities.`,
    `- Produce a description AND a feature list for EACH of these languages: ${langList}. Fill description_<code> and features_<code> for every one. The versions must be equivalent in meaning across languages (same items, translated), each written natively in its language.`,
    '',
    ...FEATURES_RULES,
    '',
    '- name: a tasteful short name; slug: its kebab-case form.',
    '',
    'Call the extract_property tool with the result.',
  ].join('\n')
}

export async function generatePropertyFromPdf(
  formData: FormData,
): Promise<AiExtractResult> {
  const ctx = await getCurrentTenantContext()

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada (falta ANTHROPIC_API_KEY).' }
  }

  // Límite mensual de IA del tenant (super_admin pasa siempre).
  const overLimit = await assertAiWithinLimit(ctx, 'property_intake')
  if (overLimit) return overLimit

  // Idiomas de contenido elegidos (máx 3); default inglés.
  const rawLangs = (formData.get('languages') as string | null)?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  const languages = [...new Set(rawLangs.filter(l => (SUPPORTED_LANGUAGE_CODES as string[]).includes(l)))].slice(0, 3)
  if (languages.length === 0) languages.push('en')

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Archivo no válido' }
  if (file.type !== 'application/pdf') return { ok: false, error: 'El archivo debe ser un PDF' }
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: 'El PDF supera el límite de 10 MB' }

  const bytes = Buffer.from(await file.arrayBuffer())

  // ── Store the original PDF in property-media and prefill detail_pdf_url ──────
  const resolved = resolveTargetTenant(ctx, (formData.get('tenant_id') as string) || undefined)
  const tenantFolder = typeof resolved === 'string' ? resolved : 'shared'
  // Keep AI-intake PDFs under the same per-tenant `properties/` subfolder.
  const path = `${tenantFolder}/properties/ai-intake/${crypto.randomUUID()}.pdf`

  const db = createAdminClient()
  let detailPdfUrl: string | null = null
  // Blob, not Buffer: raw Buffer fetch bodies get UTF-8-mangled on Vercel's
  // runtime (see the note in api/properties/media/route.ts).
  const { error: uploadErr } = await db.storage
    .from('property-media')
    .upload(path, new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false })
  if (!uploadErr) {
    detailPdfUrl = db.storage.from('property-media').getPublicUrl(path).data.publicUrl
  } else {
    console.error(JSON.stringify({ service: 'ai-property-intake', path: 'storage_upload_failed', detail: uploadErr.message }))
  }

  // Contexto de la agencia (064): tono y mercado para redactar las descripciones.
  let agencyDescription = ''
  if (ctx.tenant_id) {
    const { data: tn } = await db.from('tenants').select('description').eq('id', ctx.tenant_id).maybeSingle()
    agencyDescription = (((tn as { description?: string | null } | null)?.description) ?? '').trim().slice(0, 2000)
  }

  // ── Ask Claude to extract structured data from the PDF ───────────────────────
  const anthropic = new Anthropic()
  const pdfBlock: Anthropic.DocumentBlockParam = {
    type: 'document',
    source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') },
  }
  const usageMeta = { tenantId: typeof resolved === 'string' ? resolved : ctx.tenant_id, userId: ctx.user_id }

  let toolInput: Record<string, unknown>
  let stopReason: string | null = null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Thinking must be off with a forced tool call; keeps extraction deterministic.
      thinking: { type: 'disabled' },
      tools: [buildExtractTool(languages)],
      tool_choice: { type: 'tool', name: 'extract_property' },
      messages: [
        {
          role: 'user',
          content: [
            pdfBlock,
            { type: 'text', text: buildPrompt(languages, agencyDescription || undefined) },
          ],
        },
      ],
    })

    // Registro de uso (tokens + costo) — best-effort, nunca bloquea.
    await recordAiUsage({
      ...usageMeta,
      feature:  'property_intake',
      model:    MODEL,
      usage:    message.usage,
      metadata: { pdf_bytes: file.size },
    })

    stopReason = message.stop_reason
    const block = message.content.find((b) => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') {
      return { ok: false, error: 'La IA no devolvió datos estructurados. Intenta de nuevo o carga la propiedad manualmente.' }
    }
    toolInput = block.input as Record<string, unknown>
  } catch (e) {
    console.error(JSON.stringify({ service: 'ai-property-intake', error: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: 'No se pudo procesar el PDF con IA. Verifica el archivo o intenta más tarde.' }
  }

  // ── Coerce the tool output into the form-draft shape ─────────────────────────
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // Lote: sólo si la ficha declara una medida. Si salió de acres o de dimensiones
  // es una conversión nuestra, así que se redondea para no fingir precisión.
  const lotBasis = str(toolInput.lot_sqft_basis) ?? 'absent'
  const lotRaw = int(toolInput.lot_sqft)
  const lotSqft = (lotBasis === 'absent' || lotRaw === null || lotRaw <= 0)
    ? null
    : (lotBasis === 'stated_sqft' ? lotRaw : round2sig(lotRaw))

  const propertyType = (PROPERTY_TYPES as readonly string[]).includes(str(toolInput.property_type) ?? '')
    ? (str(toolInput.property_type) as AiPropertyDraft['property_type'])
    : 'residential'

  // Descripciones/características por idioma pedido.
  const descriptions: Record<string, string> = {}
  const featuresI18n: Record<string, string[]> = {}
  for (const l of languages) {
    const d = str(toolInput[`description_${l}`])
    if (d) descriptions[l] = d
    const f = toList(toolInput[`features_${l}`])
    if (f.length) featuresI18n[l] = f
  }

  // Un idioma sin lista se vuelve a pedir, y solo. El log queda igual aunque el
  // reintento funcione: es lo que faltó para diagnosticar las dos veces que esto
  // llegó vacío al formulario — dice si la respuesta se truncó (stop_reason),
  // qué forma tenía el campo y qué claves trajo el modelo.
  const sinFeatures = languages.filter(l => !featuresI18n[l]?.length)
  if (sinFeatures.length > 0) {
    console.error(JSON.stringify({
      service: 'ai-property-intake',
      path: 'features_vacias',
      stop_reason: stopReason,
      idiomas: sinFeatures,
      forma: Object.fromEntries(sinFeatures.map(l => {
        const v = toolInput[`features_${l}`]
        return [l, Array.isArray(v) ? `array(${v.length})` : typeof v]
      })),
      claves: Object.keys(toolInput),
    }))

    try {
      const retry = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: 'disabled' },
        tools: [buildFeaturesTool(sinFeatures)],
        tool_choice: { type: 'tool', name: 'list_features' },
        messages: [{ role: 'user', content: [pdfBlock, { type: 'text', text: buildFeaturesPrompt(sinFeatures) }] }],
      })
      await recordAiUsage({
        ...usageMeta,
        feature:  'property_intake',
        model:    MODEL,
        usage:    retry.usage,
        metadata: { pdf_bytes: file.size, pasada: 'features_retry' },
      })
      const rBlock = retry.content.find((b) => b.type === 'tool_use')
      if (rBlock && rBlock.type === 'tool_use') {
        const rInput = rBlock.input as Record<string, unknown>
        for (const l of sinFeatures) {
          const f = toList(rInput[`features_${l}`])
          if (f.length) featuresI18n[l] = f
        }
      }
    } catch (e) {
      // Best-effort: el borrador sigue siendo útil sin las características.
      console.error(JSON.stringify({
        service: 'ai-property-intake', path: 'features_retry_failed',
        detail: e instanceof Error ? e.message : 'unknown',
      }))
    }
  }

  const draft: AiPropertyDraft = {
    address:        str(toolInput.address) ?? '',
    city:           str(toolInput.city),
    state:          str(toolInput.state),
    neighborhood:   str(toolInput.neighborhood),
    property_type:  propertyType,
    list_price:     num(toolInput.list_price),
    bedrooms:       int(toolInput.bedrooms),
    bathrooms_full: int(toolInput.bathrooms_full),
    bathrooms_half: int(toolInput.bathrooms_half),
    sqft:           int(toolInput.sqft),
    lot_sqft:       lotSqft,
    year_built:     int(toolInput.year_built),
    garage_spaces:  int(toolInput.garage_spaces),
    mls_number:     str(toolInput.mls_number),
    name:           str(toolInput.name),
    slug:           str(toolInput.slug),
    content_languages: languages,
    descriptions,
    features_i18n:  featuresI18n,
    detail_pdf_url: detailPdfUrl,
  }

  // Guard: if nothing identifying came back, the PDF probably isn't a listing.
  if (!draft.address && draft.list_price === null && draft.sqft === null && draft.bedrooms === null) {
    return { ok: false, error: 'El PDF no parece ser un listado de propiedad. Revisa el archivo.' }
  }

  // Report which scalar fields got a value so the UI can flag them for review.
  const SCALAR_KEYS: (keyof AiPropertyDraft)[] = [
    'address', 'city', 'state', 'neighborhood', 'property_type', 'list_price',
    'bedrooms', 'bathrooms_full', 'bathrooms_half', 'sqft', 'lot_sqft', 'year_built',
    'garage_spaces', 'mls_number', 'name', 'slug',
  ]
  const fields = SCALAR_KEYS.filter(k => {
    const v = draft[k]
    return v !== null && v !== undefined && v !== ''
  }).map(String)
  if (Object.keys(descriptions).length) fields.push('descriptions')
  if (Object.keys(featuresI18n).length) fields.push('features_i18n')

  const warnings: string[] = []
  if (uploadErr) warnings.push('El PDF no se guardó en Storage, pero el formulario fue pre-llenado correctamente.')
  if (Object.keys(featuresI18n).length === 0) warnings.push('La IA no devolvió características. Revisa el PDF y agrégalas a mano antes de publicar.')

  return {
    ok: true,
    draft,
    fields,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  }
}
