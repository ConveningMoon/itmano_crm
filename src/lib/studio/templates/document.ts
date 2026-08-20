// El documento que Chrome renderiza y que el iframe del editor enseña. Es la
// MISMA cadena en los dos sitios: ahí vive la promesa de "lo que se ve es lo
// que sale" — no en que ambos sean Chrome, sino en que no hay dos caminos.
//
// Puro a propósito: sin `server-only`, sin imports de Node. El cliente lo usa.

export interface TemplateDocumentInput {
  /** El HTML del autor, con {{claves}} y {{#secciones}}. */
  html: string
  /** El CSS del autor. Va después del reset para poder pisarlo. */
  css: string
  /** Solo las claves CON dato: una clave ausente y una vacía son lo mismo. */
  values: Record<string, string>
  /**
   * Fragmentos de HTML que se insertan SIN escapar, con `{{&clave}}`.
   *
   * Los produce values.ts, nunca el formulario: el titular con énfasis alterno
   * necesita llegar ya marcado porque el CSS no puede seleccionar palabras
   * sueltas de una cadena. Cada palabra se escapa antes de envolverse.
   */
  rawValues: Record<string, string>
  /** Custom properties de :root — los colores de la paleta de la pieza. */
  vars: Record<string, string>
  /** Clases de estado del <html>: sin-precio, fotos-2, datos-4… */
  flags: string[]
  /** Las @font-face ya resueltas. Cadena vacía si no hace falta ninguna. */
  fontFaceCss: string
  width: number
  height: number
}

const RESET = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:var(--w);height:var(--h)}
body{overflow:hidden;-webkit-font-smoothing:antialiased}
img{display:block}`

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ESCAPES[c])
}

/**
 * Quita los bloques cuyo dato no existe.
 *
 * Sustituye a `{p.price && <bloque/>}` del TSX. Las secciones NO anidan: una
 * dentro de otra no está soportada y no hace falta — para reaccionar a
 * combinaciones de datos están las clases de estado.
 */
export function resolveSections(html: string, present: Record<string, string>): string {
  return html.replace(
    /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, body: string) => (present[key] ? body : ''),
  )
}

/**
 * Sustituye `{{clave}}` escapando, y `{{&clave}}` sin escapar.
 *
 * Sin dato deja el hueco vacío, nunca la llave a la vista: una plantilla a la
 * que le falte un dato tiene que verse incompleta, no rota.
 */
export function interpolate(
  html: string, values: Record<string, string>, rawValues: Record<string, string>,
): string {
  return html
    .replace(/\{\{&([\w.]+)\}\}/g, (_match, key: string) => rawValues[key] ?? '')
    .replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => escapeHtml(values[key] ?? ''))
}

export function buildTemplateDocument(input: TemplateDocumentInput): string {
  // El orden importa: primero desaparecen los bloques sin dato, y solo después
  // se sustituye lo que quedó. Al revés, un {{#price}} ya sustituido no se
  // reconocería como sección y el bloque saldría vacío en vez de no salir.
  // Las secciones miran los dos mapas: `{{#headlineRitmo}}` tiene que funcionar
  // igual que `{{#price}}` aunque su contenido sea un fragmento.
  const present = { ...input.values, ...input.rawValues }
  const body = interpolate(resolveSections(input.html, present), input.values, input.rawValues)

  const vars = [
    ...Object.entries(input.vars).map(([name, value]) => `--${name}:${value}`),
    `--w:${input.width}px`,
    `--h:${input.height}px`,
  ].join(';')

  return `<!doctype html><html class="${input.flags.join(' ')}"><head><meta charset="utf-8">`
    + `<style>${input.fontFaceCss}\n:root{${vars}}\n${RESET}\n${input.css}</style>`
    + `</head><body>${body}</body></html>`
}
