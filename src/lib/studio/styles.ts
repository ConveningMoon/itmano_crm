// Los seis estilos del Estudio, como DATO. Cada uno lleva dos textos distintos:
// `label`/`hint` es lo que lee el usuario en el dropdown, y `direction` es el
// párrafo de dirección de arte que consume el director de prompt. Sin ese
// párrafo, "lujo nocturno" es una etiqueta que el modelo interpreta a su antojo.
//
// La dirección va en inglés porque el prompt de imagen va en inglés: Nano Banana
// responde bastante mejor así.

export interface StudioStyle {
  key:       string
  label:     string
  hint:      string
  direction: string
}

export const STYLES: StudioStyle[] = [
  {
    key: 'editorial',
    label: 'Fotografía editorial',
    hint: 'Luz natural, encuadre de revista de arquitectura',
    direction: 'Editorial architectural photography, natural daylight, wide-angle lens around 24mm, balanced exposure, restrained color grading, magazine-quality composition with generous negative space.',
  },
  {
    key: 'render',
    label: 'Render arquitectónico',
    hint: 'Limpio y volumétrico, como un render de proyecto',
    direction: 'Clean architectural visualization, soft global illumination, precise geometry and materials, uncluttered surroundings, neutral sky, the calm look of a professional project render.',
  },
  {
    key: 'typographic',
    label: 'Minimalista tipográfico',
    hint: 'Fondo sobrio de color, sin escena: el texto manda',
    direction: 'Minimal abstract background: a single flat or subtly graded color field with faint paper or linen texture, no buildings, no objects, no scene. Built to sit behind typography.',
  },
  {
    key: 'warm_home',
    label: 'Cálido de hogar',
    hint: 'Interiores vividos, luz de tarde, sensación de familia',
    direction: 'Warm lived-in interior, late afternoon light raking through windows, soft shadows, homely textures like wood and textiles, inviting and unstaged.',
  },
  {
    key: 'night_luxury',
    label: 'Lujo nocturno',
    hint: 'Contraste alto, luces cálidas contra azul de anochecer',
    direction: 'Blue hour exterior, high contrast between warm interior lights and deep blue sky, reflective surfaces, crisp shadows, restrained glamour without glare.',
  },
  {
    key: 'flat_illustration',
    label: 'Ilustración plana',
    hint: 'Vectorial, formas simples — funciona bien en eventos',
    direction: 'Flat vector illustration, simple geometric shapes, limited palette, no gradients beyond subtle flat shading, clear silhouettes, generous empty areas.',
  },
]

export const STYLE_KEYS = STYLES.map(s => s.key)

export function styleDirection(key: string): string {
  return STYLES.find(s => s.key === key)?.direction ?? ''
}

export function styleLabel(key: string): string {
  return STYLES.find(s => s.key === key)?.label ?? key
}
