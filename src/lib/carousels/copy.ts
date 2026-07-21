import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import {
  V2_COPY_RULES, DATA_INTEGRITY_RULE, IMAGE_COMPLIANCE_RULE, ICON_HINT, ICON_KEYS,
} from './brand'
import type { CarouselBrandProfile, CarouselCopy, ResearchResult, SlideCopy, SlideType } from './types'

// Generación del copy estructurado con la Claude API (mismo patrón que la
// intake de propiedades: forced tool use → JSON determinista por slide).

const MODEL = 'claude-sonnet-5'
const SLIDE_TYPES: SlideType[] = ['cover', 'data', 'emotional', 'text', 'cta']

function buildTool(): Anthropic.Tool {
  return {
    name: 'write_carousel',
    description: 'Devuelve el carrusel completo de 8 slides + caption, siguiendo el sistema v2.',
    input_schema: {
      type: 'object',
      properties: {
        topic:    { type: 'string', description: 'El tema final del carrusel (1 frase).' },
        audience: { type: 'string', description: 'La audiencia específica elegida para este carrusel.' },
        slides: {
          type: 'array',
          description: 'Exactamente 8 slides en orden.',
          items: {
            type: 'object',
            properties: {
              slide_number: { type: 'integer', description: '1..8' },
              slide_type:   { type: 'string', enum: SLIDE_TYPES, description: 'cover(1) · data/emotional/text(2-7) · cta(8)' },
              label:        { type: ['string', 'null'], description: 'Gancho pequeño dorado (arriba). Tono secreto/chisme. Sin punto final.' },
              title:        { type: ['string', 'null'], description: 'Título grande dominante. En portada, nombra lo específico/reconocible. Sin punto final.' },
              subtitle:     { type: ['string', 'null'], description: 'Apoyo/subtítulo mediano. Sin punto final.' },
              lines:        { type: ['array', 'null'], items: { type: 'string' }, description: 'Solo para el slide de 3 líneas de impacto (slide 5) o los 3 pasos numerados (slide 7).' },
              icon:         { type: ['string', 'null'], enum: [...ICON_KEYS, null], description: 'Ícono de línea para data slides, o null.' },
              image_prompt: { type: ['string', 'null'], description: 'Prompt en INGLÉS para Nano Banana SOLO en portada, slide emocional y cierre; null en el resto. < 1000 chars, sin personas reales identificables.' },
            },
            required: ['slide_number', 'slide_type', 'label', 'title', 'subtitle', 'lines', 'icon', 'image_prompt'],
          },
        },
        caption:  { type: 'string', description: 'Caption para publicar: gancho + resumen fluido + CTA (comentar palabra clave + seguir + guardar).' },
        hashtags: { type: 'array', items: { type: 'string' }, description: 'EXACTAMENTE 5 hashtags relevantes, con # incluido.' },
      },
      required: ['topic', 'audience', 'slides', 'caption', 'hashtags'],
    },
  }
}

// El system prompt se parte en DOS bloques para el prompt caching:
//   1) Reglas del motor (v2 + datos + imagen + íconos) — estáticas, iguales para
//      todos los tenants. Se cachean (cache_control) → relecturas cuestan 0.1×.
//   2) Contexto de marca del agente — cambia si el super_admin lo edita. Va
//      después del breakpoint, así editarlo NO invalida el bloque grande cacheado
//      (solo se reprocesa este bloque pequeño, ~una vez).
function engineRules(): string {
  return [
    `Eres un redactor experto de carruseles de Instagram para agentes inmobiliarios. Idioma: español neutro latino, cálido y experto.`,
    `\n\n${V2_COPY_RULES}`,
    `\n\n${DATA_INTEGRITY_RULE}`,
    `\n\n${IMAGE_COMPLIANCE_RULE}`,
    `\n\n${ICON_HINT}`,
    `\n\nDevuelve el resultado llamando a la herramienta write_carousel. Los image_prompt van en INGLÉS (la IA de imagen entiende mejor inglés); todo el copy visible va en español.`,
  ].join('')
}

function brandContext(brand: CarouselBrandProfile): string {
  return [
    `PERFIL DE MARCA DE ESTE CARRUSEL:`,
    `\n- Agente: ${brand.display_name} (${brand.instagram_handle})`,
    brand.agency_name ? `\n- Agencia: ${brand.agency_name}` : '',
    brand.market ? `\n- Mercado: ${brand.market}` : '',
    brand.brand_voice ? `\n- Voz de marca: ${brand.brand_voice}` : '',
    `\n\nEscribe todo el copy fiel a este perfil.`,
  ].join('')
}

function userPrompt(topic: string | null, research: ResearchResult | null): string {
  if (research?.chosen) {
    const c = research.chosen
    return [
      `Genera el carrusel sobre este tema en tendencia elegido por investigación:`,
      `\n- Tema: ${c.title}`,
      `\n- Ángulo a bienes raíces: ${c.angle}`,
      `\n- Audiencia: ${c.audience}`,
      c.source ? `\n- Fuente citable: ${c.source}` : '',
      research.summary ? `\n- Por qué es viral ahora: ${research.summary}` : '',
      `\n\nSi usas algún dato numérico, debe apoyarse en la fuente citable (o en otra fuente real). Si no hay fuente para un número, reescribe en términos cualitativos.`,
    ].join('')
  }
  return [
    `Genera el carrusel sobre este tema indicado manualmente: "${topic}".`,
    `\nElige la audiencia específica más adecuada y un ángulo narrativo fresco (evita el clásico "antes vs ahora" de precios/tasas salvo que sea el corazón del tema).`,
    `\nNo inventes cifras: usa solo datos reales citables o reescribe en términos cualitativos.`,
  ].join('')
}

export interface CopyResult {
  copy:  CarouselCopy
  usage: Anthropic.Usage
}

export async function generateCopy(params: {
  brand:    CarouselBrandProfile
  topic:    string | null
  research: ResearchResult | null
}): Promise<CopyResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY')

  const anthropic = new Anthropic()
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 5000,
    thinking: { type: 'disabled' },
    tools: [buildTool()],
    tool_choice: { type: 'tool', name: 'write_carousel' },
    // Bloque 1 cacheado (reglas del motor) + bloque 2 con el contexto de marca.
    system: [
      { type: 'text', text: engineRules(), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: brandContext(params.brand) },
    ],
    messages: [{ role: 'user', content: userPrompt(params.topic, params.research) }],
  })

  const block = message.content.find((b) => b.type === 'tool_use')
  if (!block || block.type !== 'tool_use') throw new Error('La IA no devolvió el copy estructurado')
  const input = block.input as Record<string, unknown>

  const copy = coerceCopy(input)
  return { copy, usage: message.usage }
}

// ── Coerción defensiva del output de la herramienta ──────────────────────────
function coerceCopy(input: Record<string, unknown>): CarouselCopy {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : []

  const rawSlides = Array.isArray(input.slides) ? input.slides : []
  const slides: SlideCopy[] = rawSlides.map((s, i) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const type = SLIDE_TYPES.includes(o.slide_type as SlideType) ? (o.slide_type as SlideType) : 'text'
    const iconRaw = str(o.icon)
    const icon = iconRaw && ICON_KEYS.includes(iconRaw) ? iconRaw : null
    const lines = arr(o.lines)
    let imgPrompt = str(o.image_prompt)
    if (imgPrompt && imgPrompt.length > 1000) imgPrompt = imgPrompt.slice(0, 1000)
    return {
      slide_number: typeof o.slide_number === 'number' ? o.slide_number : i + 1,
      slide_type:   type,
      label:        str(o.label),
      title:        str(o.title),
      subtitle:     str(o.subtitle),
      lines:        lines.length ? lines : null,
      icon,
      image_prompt: imgPrompt,
    }
  })

  // hashtags: normaliza a exactamente 5 con # inicial.
  const hashtags = arr(input.hashtags).map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 5)
  while (hashtags.length < 5) hashtags.push('#BienesRaices')

  return {
    topic:    str(input.topic) ?? '',
    audience: str(input.audience) ?? '',
    slides,
    caption:  str(input.caption) ?? '',
    hashtags,
  }
}
