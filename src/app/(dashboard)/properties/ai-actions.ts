'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { resolveTargetTenant } from '@/lib/auth/guards'
import { recordAiUsage } from '@/lib/services/ai-usage'
import type { PropertyInput } from './actions'

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
export type AiPropertyDraft = Pick<
  PropertyInput,
  | 'address' | 'city' | 'state' | 'neighborhood' | 'property_type'
  | 'list_price' | 'bedrooms' | 'bathrooms_full' | 'bathrooms_half'
  | 'sqft' | 'lot_sqft' | 'year_built' | 'garage_spaces' | 'mls_number'
  | 'name' | 'slug' | 'description_en' | 'description_es'
  | 'features_en' | 'features_es'
> & { detail_pdf_url: string | null }

export type AiExtractResult =
  | { ok: true; draft: AiPropertyDraft; fields: Array<keyof AiPropertyDraft>; warning?: string }
  | { ok: false; error: string }

const PROPERTY_TYPES = ['residential', 'condo', 'townhouse', 'land', 'commercial', 'multifamily'] as const

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_property',
  description:
    'Return the structured data for one real-estate listing extracted from the PDF, ' +
    'plus drafted bilingual marketing copy.',
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
      lot_sqft:       { type: ['integer', 'null'], description: 'Lot size in square feet (convert acres if needed: 1 acre = 43560 sqft).' },
      year_built:     { type: ['integer', 'null'] },
      garage_spaces:  { type: ['integer', 'null'] },
      mls_number:     { type: ['string', 'null'] },
      name:           { type: ['string', 'null'], description: 'A short, warm marketing name for the listing (e.g. "Oakmont Manor"). Invent a tasteful one from the street/neighborhood if none is given.' },
      slug:           { type: ['string', 'null'], description: 'kebab-case slug derived from name (lowercase, hyphens, ascii only).' },
      description_en: { type: ['string', 'null'], description: 'Warm, professional listing description in ENGLISH (2-4 sentences). Only use facts present in the PDF.' },
      description_es: { type: ['string', 'null'], description: 'The same description in NEUTRAL LATIN AMERICAN SPANISH. Use "inversión", never "precio/costo".' },
      features_en:    { type: 'array', items: { type: 'string' }, description: 'Bullet features in English (each a short phrase). Only facts from the PDF.' },
      features_es:    { type: 'array', items: { type: 'string' }, description: 'The same features in neutral Latin American Spanish.' },
    },
    required: ['property_type', 'features_en', 'features_es'],
  },
}

const PROMPT = [
  'Extract the data for this real-estate property listing from the attached PDF.',
  '',
  'Rules:',
  '- Extract factual fields (address, price, beds, baths, sqft, year, MLS, etc.) ONLY if they appear in the PDF. Never invent numbers or an address. Return null for anything not present.',
  '- If the document is clearly NOT a property listing, set address, list_price, sqft and bedrooms all to null.',
  '- Write description_en and description_es AND features_en/features_es in a warm, premium, trustworthy real-estate tone — calm and specific, no hype, no emojis. Base them strictly on facts in the PDF; do not fabricate amenities.',
  '- Spanish must be neutral Latin American Spanish (no regional idioms). For money use "inversión", never "precio", "costo" or "pago".',
  '- Keep the English and Spanish descriptions equivalent in meaning; same for the feature lists (same items, translated).',
  '- name: a tasteful short name; slug: its kebab-case form.',
  '',
  'Call the extract_property tool with the result.',
].join('\n')

export async function generatePropertyFromPdf(
  formData: FormData,
): Promise<AiExtractResult> {
  const ctx = await getCurrentTenantContext()

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada (falta ANTHROPIC_API_KEY).' }
  }

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

  // ── Ask Claude to extract structured data from the PDF ───────────────────────
  let toolInput: Record<string, unknown>
  try {
    const anthropic = new Anthropic()
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // Thinking must be off with a forced tool call; keeps extraction deterministic.
      thinking: { type: 'disabled' },
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_property' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    })

    // Registro de uso (tokens + costo) — best-effort, nunca bloquea.
    await recordAiUsage({
      tenantId: typeof resolved === 'string' ? resolved : ctx.tenant_id,
      userId:   ctx.user_id,
      feature:  'property_intake',
      model:    MODEL,
      usage:    message.usage,
      metadata: { pdf_bytes: file.size },
    })

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
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : []

  const propertyType = (PROPERTY_TYPES as readonly string[]).includes(str(toolInput.property_type) ?? '')
    ? (str(toolInput.property_type) as AiPropertyDraft['property_type'])
    : 'residential'

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
    lot_sqft:       int(toolInput.lot_sqft),
    year_built:     int(toolInput.year_built),
    garage_spaces:  int(toolInput.garage_spaces),
    mls_number:     str(toolInput.mls_number),
    name:           str(toolInput.name),
    slug:           str(toolInput.slug),
    description_en: str(toolInput.description_en),
    description_es: str(toolInput.description_es),
    features_en:    arr(toolInput.features_en),
    features_es:    arr(toolInput.features_es),
    detail_pdf_url: detailPdfUrl,
  }

  // Guard: if nothing identifying came back, the PDF probably isn't a listing.
  if (!draft.address && draft.list_price === null && draft.sqft === null && draft.bedrooms === null) {
    return { ok: false, error: 'El PDF no parece ser un listado de propiedad. Revisa el archivo.' }
  }

  // Report which fields actually got a value so the UI can flag them for review.
  const fields = (Object.keys(draft) as Array<keyof AiPropertyDraft>).filter((k) => {
    const v = draft[k]
    if (Array.isArray(v)) return v.length > 0
    return v !== null && v !== ''
  })

  return {
    ok: true,
    draft,
    fields,
    ...(uploadErr ? { warning: 'El PDF no se guardó en Storage, pero el formulario fue pre-llenado correctamente.' } : {}),
  }
}
