// Tipos del Carousel Engine. Fuente de verdad para el pipeline, el data-layer,
// las server actions y la UI. Espejo de las tablas de la migración 065.

export type CarouselJobStatus =
  | 'pending'
  | 'researching'
  | 'writing_copy'
  | 'generating_images'
  | 'composing'
  | 'ready'
  | 'failed'

export type CarouselSlideStatus = 'pending' | 'rendering' | 'ready' | 'failed'

export type SlideType = 'cover' | 'data' | 'emotional' | 'text' | 'cta'

export type TopicSource = 'manual' | 'trend_research'

export type ImageSource = 'nano_banana' | 'procedural'

export interface CarouselBrandProfile {
  agent_id:         string
  tenant_id:        string
  display_name:     string
  instagram_handle: string
  agency_name:      string | null
  market:           string | null
  language:         string
  brand_voice:      string | null
  // Prompt de estilo/diseño (reglas v2) editable por agente. null = usar el
  // default del código (V2_COPY_RULES). Las reglas duras de cumplimiento se
  // aplican siempre aparte, se sobreescriba o no este prompt.
  style_prompt:     string | null
  active:           boolean
}

// Una tendencia/fuente encontrada en el paso de investigación (Gemini grounding).
export interface ResearchTrend {
  title:    string   // titular corto de la tendencia
  angle:    string   // ángulo narrativo para bienes raíces (no financiero repetido)
  audience: string   // audiencia específica sugerida
  source:   string   // fuente citable (NAR, Zillow, un evento, una noticia…)
  url?:     string   // enlace si el grounding lo devolvió
}

export interface ResearchResult {
  trends:  ResearchTrend[]
  chosen:  ResearchTrend | null   // la que el modelo eligió desarrollar
  summary: string                 // por qué se eligió y por qué es viral ahora
}

// El copy estructurado que devuelve Claude, por slide. Espejo de carousel_slides
// (sin los campos de storage/estado, que los llena el compositor).
export interface SlideCopy {
  slide_number: number
  slide_type:   SlideType
  label:        string | null      // gancho pequeño dorado
  title:        string | null      // título grande dominante
  subtitle:     string | null      // apoyo/subtítulo
  lines:        string[] | null    // slide de 3 líneas de impacto
  icon:         string | null      // clave de ícono de línea (ver brand.ts ICONS)
  // Si el slide lleva foto editorial (portada/emocional/cierre), el prompt exacto
  // para Nano Banana (< 1000 chars, sin personas reales identificables). null →
  // fondo procedural (crema + textura), sin foto.
  image_prompt: string | null
}

export interface CarouselCopy {
  topic:    string
  audience: string
  slides:   SlideCopy[]
  caption:  string
  hashtags: string[]   // exactamente 5
}

// Filas tal cual salen del data-layer (admin client).
export interface CarouselJob {
  id:            string
  tenant_id:     string
  agent_id:      string
  topic:         string | null
  topic_source:  TopicSource
  audience:      string | null
  status:        CarouselJobStatus
  copy_json:     CarouselCopy | null
  research_json: ResearchResult | null
  caption:       string | null
  hashtags:      string[] | null
  error_message: string | null
  created_by:    string | null
  created_at:    string
  updated_at:    string
}

export interface CarouselSlide {
  id:                    string
  job_id:                string
  slide_number:          number
  slide_type:            SlideType | null
  copy_label:            string | null
  copy_title:            string | null
  copy_subtitle:         string | null
  copy_lines:            string[] | null
  icon:                  string | null
  image_source:          ImageSource | null
  image_prompt:          string | null
  image_storage_path:    string | null
  rendered_storage_path: string | null
  rendered_url:          string | null   // derivado (getPublicUrl) en el data-layer
  status:                CarouselSlideStatus
  error_message:         string | null
}

export interface CarouselJobWithSlides extends CarouselJob {
  slides: CarouselSlide[]
}

// Resultado tipado uniforme de las server actions (nunca throw al cliente).
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }
