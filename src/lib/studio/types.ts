// Tipos del Estudio. Espejo de la migración 093 y contrato entre el pipeline,
// el data-layer, las server actions y la UI.

export type StudioRecipe   = 'open_house' | 'new_listing' | 'sold' | 'event' | 'open_prompt'
export type SourceMode     = 'generate' | 'photo'
export type ReferenceRole  = 'subject' | 'style' | 'composition'
export type TextZone       = 'top' | 'bottom' | 'left'
export type Aspect         = '1:1' | '4:5' | '9:16' | '16:9'
export type StudioStatus   = 'pending' | 'generating' | 'composing' | 'ready' | 'failed'

// La marca con la que se compone: sale de tenants + agents, nunca del código.
export interface StudioBrand {
  tenant_name:   string
  logo_url:      string | null
  primary_color: string
  agent_name:    string | null
  agent_phone:   string | null
}

export interface StudioImage {
  id:              string
  tenant_id:       string
  agent_id:        string | null
  recipe:          StudioRecipe
  property_id:     string | null
  form_json:       Record<string, unknown>
  source_mode:     SourceMode
  style:           string
  palette:         string[] | null
  aspect:          Aspect
  // La primera referencia y la lista completa. `reference_path` se conserva
  // porque las filas anteriores a la migración 102 solo tienen esa.
  reference_path:  string | null
  reference_paths: string[]
  reference_role:  ReferenceRole | null
  scene_prompt:    string | null
  text_zone:       TextZone | null
  background_path: string | null
  rendered_path:   string | null
  rendered_url:    string | null   // derivado (getPublicUrl) en el data-layer
  status:          StudioStatus
  error_message:   string | null
  cost_usd:        number
  created_at:      string
  // El diseño congelado al generar: {html, css} de entonces. Recomponer lo usa
  // en vez del diseño vivo, para que una edición al diseño no reescriba piezas
  // que el tenant ya publicó.
  template_snapshot: { html: string; css: string } | null
}

// Resultado tipado uniforme de las server actions (nunca throw al cliente).
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }
