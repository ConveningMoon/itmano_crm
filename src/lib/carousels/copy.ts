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
// El prompt de estilo/diseño (reglas v2) es editable por agente. Si el agente no
// lo sobreescribió, se usa el default del código (V2_COPY_RULES). Las reglas
// duras (no inventar datos, no rostros reales, íconos, formato de salida) SIEMPRE
// se anexan aparte — no dependen del prompt editable.
function engineRules(brand: CarouselBrandProfile): string {
  const style = brand.style_prompt?.trim() || V2_COPY_RULES
  return [
    `Eres un redactor experto de carruseles de Instagram para agentes inmobiliarios. Idioma: español neutro latino, cálido y experto.`,
    `\n\n${style}`,
    `\n\n${DATA_INTEGRITY_RULE}`,
    `\n\n${IMAGE_COMPLIANCE_RULE}`,
    `\n\n${ICON_HINT}`,
    `\n\nSALIDA: devuelve el resultado llamando a la herramienta write_carousel. Escribe TEXTO PLANO en todos los campos — NUNCA incluyas etiquetas HTML/XML, "<...>", ni nombres de parámetros dentro del texto. El caption es prosa; NO metas los hashtags dentro del caption (van en el campo hashtags aparte). Los hashtags: exactamente 5, todos DISTINTOS, sin repetir. Los image_prompt van en INGLÉS (la IA de imagen entiende mejor inglés); todo el copy visible va en español.`,
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
  // 1) Investigación estructurada: tema ya elegido.
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
  // 2) Investigación sin estructura (prosa del grounding): Claude elige el tema.
  if (research?.rawText || research?.summary) {
    return [
      `A partir de esta investigación de tendencias ACTUALES, ELIGE TÚ el mejor tema para un carrusel viral (con conexión clara y no forzada a bienes raíces), y también la audiencia y el ángulo:`,
      `\n\n"""\n${research.rawText || research.summary}\n"""`,
      `\n\nPrefiere tendencias populares (artista, serie, evento deportivo, noticia de celebridad) sobre datos financieros. No inventes cifras: usa solo datos reales que aparezcan arriba o reescribe en términos cualitativos.`,
    ].join('')
  }
  // 3) Tema manual.
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
      { type: 'text', text: engineRules(params.brand), cache_control: { type: 'ephemeral' } },
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

// Limpia texto que a veces sale del modelo con etiquetas HTML/XML incrustadas
// (p. ej. </caption>, <parameter name="hashtags">) o entidades. Nunca deben
// aparecer en un slide ni en el caption.
function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v
    .replace(/<[^>]*>/g, ' ')                    // quita etiquetas <...>
    .replace(/&[a-z]+;/gi, ' ')                  // entidades &nbsp; etc.
    .replace(/\bname\s*=\s*"[^"]*"/gi, ' ')       // restos de atributos
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return t.length ? t : null
}

// ── Coerción defensiva del output de la herramienta ──────────────────────────
function coerceCopy(input: Record<string, unknown>): CarouselCopy {
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => clean(x)).filter((x): x is string => !!x) : []

  const rawSlides = Array.isArray(input.slides) ? input.slides : []
  const slides: SlideCopy[] = rawSlides.map((s, i) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
    const type = SLIDE_TYPES.includes(o.slide_type as SlideType) ? (o.slide_type as SlideType) : 'text'
    const iconRaw = clean(o.icon)
    const icon = iconRaw && ICON_KEYS.includes(iconRaw) ? iconRaw : null
    const lines = arr(o.lines)
    let imgPrompt = clean(o.image_prompt)
    if (imgPrompt && imgPrompt.length > 1000) imgPrompt = imgPrompt.slice(0, 1000)
    return {
      slide_number: typeof o.slide_number === 'number' ? o.slide_number : i + 1,
      slide_type:   type,
      label:        clean(o.label),
      title:        clean(o.title),
      subtitle:     clean(o.subtitle),
      lines:        lines.length ? lines : null,
      icon,
      image_prompt: imgPrompt,
    }
  })

  // Caption: limpio + sin fragmentos de array de hashtags filtrados + sin el
  // bloque final de hashtags (los mostramos aparte).
  let caption = clean(input.caption) ?? ''
  caption = caption
    .replace(/\[\s*"?#[^\]]*\]/g, '')                    // ["#CasaPropia", ...] filtrado
    .replace(/(?:\s*#[\wÁÉÍÓÚÑáéíóúñ]+)+\s*$/u, '')        // bloque de hashtags al final
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  // Hashtags: dedup (case-insensitive), con # inicial, exactamente 5 sin repetir.
  const seen = new Set<string>()
  const hashtags: string[] = []
  for (const raw of arr(input.hashtags)) {
    const tag = (raw.startsWith('#') ? raw : `#${raw}`).replace(/\s+/g, '')
    const key = tag.toLowerCase()
    if (tag.length > 1 && !seen.has(key)) { seen.add(key); hashtags.push(tag) }
    if (hashtags.length === 5) break
  }
  // Relleno con tags relevantes DISTINTOS (nunca el mismo repetido).
  for (const fb of ['#BienesRaices', '#CasaPropia', '#ComunidadHispana', '#Inversion', '#RealEstate']) {
    if (hashtags.length >= 5) break
    if (!seen.has(fb.toLowerCase())) { seen.add(fb.toLowerCase()); hashtags.push(fb) }
  }

  return {
    topic:    clean(input.topic) ?? '',
    audience: clean(input.audience) ?? '',
    slides,
    caption,
    hashtags,
  }
}
