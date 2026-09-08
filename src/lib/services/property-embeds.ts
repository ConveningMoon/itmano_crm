// Embeds de terceros en la ficha pública de una propiedad: tours 3D de Zillow o
// Matterport, videos, un mapa.
//
// El agente pega el snippet que le da el botón de compartir del proveedor, pero
// de ese texto sólo se guarda LA URL, nunca el HTML. Guardar el `<iframe>` tal
// cual obligaría a pintarlo con dangerouslySetInnerHTML, y eso convierte a
// cualquiera que pueda editar una propiedad en alguien capaz de inyectar
// <script> en una página pública con la marca del cliente. La página construye
// su propio iframe a partir de la url validada.
//
// La frontera de seguridad es la lista blanca de HOSTS. Las reglas de ruta que
// hay debajo no son seguridad: existen para no guardar enlaces que el navegador
// se negaría a embeber (la ficha de Zillow, el enlace de compartir de Maps),
// que dejarían un recuadro en blanco en la web del cliente sin ningún error.
//
// Módulo puro: lo usan el formulario (cliente) y la server action (que revalida,
// porque la url que llega del navegador no es de fiar).

export const EMBED_PLACEMENTS = ['tour', 'extra'] as const
export type EmbedPlacement = (typeof EMBED_PLACEMENTS)[number]

export const EMBED_PROVIDERS = ['zillow', 'matterport', 'iguide', 'youtube', 'vimeo', 'gmaps'] as const
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number]

export type PropertyEmbed = {
  url: string
  provider: EmbedProvider
  title: string | null
  placement: EmbedPlacement
}

export const MAX_EMBEDS = 6
export const MAX_EMBED_URL = 500

export const PROVIDER_LABEL: Record<EmbedProvider, string> = {
  zillow:     'Zillow 3D Home',
  matterport: 'Matterport',
  iguide:     'iGuide',
  youtube:    'YouTube',
  vimeo:      'Vimeo',
  gmaps:      'Google Maps',
}

// Títulos de las dos secciones de la ficha pública. `tour` va después de "Sobre
// la propiedad"; `extra` va justo antes de "Planos".
export const PLACEMENT_LABEL: Record<EmbedPlacement, string> = {
  tour:  'Recorrido virtual',
  extra: 'Video y multimedia',
}
export const PLACEMENT_HINT: Record<EmbedPlacement, string> = {
  tour:  'Después de la descripción',
  extra: 'Antes de los planos',
}

const HOSTS: Record<EmbedProvider, readonly string[]> = {
  zillow:     ['www.zillow.com', 'zillow.com'],
  matterport: ['my.matterport.com'],
  iguide:     ['youriguide.com', 'www.youriguide.com', 'unbranded.youriguide.com'],
  youtube:    ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtu.be'],
  vimeo:      ['player.vimeo.com', 'vimeo.com', 'www.vimeo.com'],
  gmaps:      ['www.google.com', 'google.com', 'maps.google.com'],
}

const HOST_TO_PROVIDER: ReadonlyMap<string, EmbedProvider> = new Map(
  EMBED_PROVIDERS.flatMap(p => HOSTS[p].map(h => [h, p] as [string, EmbedProvider])),
)

// Un mapa se lee mejor más alto que ancho; los tours y los videos son 16/9.
export function embedAspectRatio(provider: EmbedProvider): string {
  return provider === 'gmaps' ? '4 / 3' : '16 / 9'
}

const PROVIDER_LIST = EMBED_PROVIDERS.map(p => PROVIDER_LABEL[p]).join(', ')

export type EmbedParseResult =
  | { ok: true; url: string; provider: EmbedProvider }
  | { ok: false; error: string }

const fail = (error: string): EmbedParseResult => ({ ok: false, error })

// El src de un snippet copiado desde una página ya renderizada trae entidades:
// sin decodificarlas, `?m=x&amp;play=1` pierde el segundo parámetro.
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0*38;/g, '&')
    .replace(/&amp;/gi, '&')
}

const IFRAME_SRC = /<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/
const VIMEO_ID = /^\d{5,15}$/

/**
 * Acepta el snippet `<iframe …>` del proveedor o la url pelada y devuelve la
 * url embebible normalizada, o un error en español listo para mostrar.
 */
export function parseEmbedInput(raw: string): EmbedParseResult {
  const input = (raw ?? '').trim()
  if (!input) return fail('Pega el código del embed o su enlace.')

  const match = input.includes('<iframe') ? IFRAME_SRC.exec(input) : null
  const candidate = match
    ? decodeEntities((match[1] ?? match[2] ?? match[3] ?? '').trim())
    : (input.includes('<') ? '' : input)
  if (!candidate) return fail('No encontré un enlace en lo que pegaste.')

  let u: URL
  try {
    u = new URL(candidate)
  } catch {
    return fail('No encontré un enlace válido en lo que pegaste.')
  }

  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return fail('El enlace debe comenzar con https://')
  }
  if (u.username || u.password) {
    return fail('El enlace no puede llevar usuario ni contraseña.')
  }
  u.protocol = 'https:'
  u.hash = ''

  const provider = HOST_TO_PROVIDER.get(u.hostname)
  if (!provider) {
    return fail(`Ese sitio no está en la lista de proveedores admitidos. Hoy se aceptan: ${PROVIDER_LIST}.`)
  }

  const normalized = normalizeFor(provider, u)
  if (!normalized.ok) return normalized

  if (normalized.url.length > MAX_EMBED_URL) {
    return fail(`El enlace es demasiado largo (máximo ${MAX_EMBED_URL} caracteres).`)
  }
  return normalized
}

function normalizeFor(provider: EmbedProvider, u: URL): EmbedParseResult {
  const ok = (url: string): EmbedParseResult => ({ ok: true, url, provider })

  switch (provider) {
    case 'zillow': {
      // Sólo el visor IMX (3D Home). La ficha /homedetails/ bloquea el framing.
      if (!u.pathname.startsWith('/view-imx/')) {
        return fail('De Zillow se admite el enlace del tour 3D (view-imx), no la ficha de la propiedad.')
      }
      u.hostname = 'www.zillow.com'
      return ok(u.toString())
    }
    case 'matterport': {
      if (!u.pathname.startsWith('/show')) {
        return fail('De Matterport se admite el enlace del espacio (my.matterport.com/show).')
      }
      return ok(u.toString())
    }
    case 'iguide':
      return ok(u.toString())

    case 'youtube': {
      const id = youtubeId(u)
      if (!id) return fail('No encontré el identificador del video de YouTube en ese enlace.')
      return ok(`https://www.youtube.com/embed/${id}`)
    }
    case 'vimeo': {
      const id = vimeoId(u)
      if (!id) return fail('No encontré el identificador del video de Vimeo en ese enlace.')
      return ok(`https://player.vimeo.com/video/${id}`)
    }
    case 'gmaps': {
      // El enlace de compartir (maps.app.goo.gl, /maps/place/…) no se embebe.
      if (!u.pathname.startsWith('/maps/embed')) {
        return fail('De Google Maps se admite el enlace para insertar (maps/embed), no el de compartir.')
      }
      u.hostname = 'www.google.com'
      return ok(u.toString())
    }
  }
}

function youtubeId(u: URL): string | null {
  const seg = u.pathname.split('/').filter(Boolean)
  const candidate =
    u.hostname === 'youtu.be'                        ? seg[0]
    : seg[0] === 'embed' || seg[0] === 'shorts'      ? seg[1]
    : seg[0] === 'watch'                             ? (u.searchParams.get('v') ?? undefined)
    : u.pathname === '/watch'                        ? (u.searchParams.get('v') ?? undefined)
    : undefined
  return candidate && YT_ID.test(candidate) ? candidate : null
}

function vimeoId(u: URL): string | null {
  const seg = u.pathname.split('/').filter(Boolean)
  const candidate = seg[0] === 'video' ? seg[1] : seg[0]
  return candidate && VIMEO_ID.test(candidate) ? candidate : null
}

/**
 * Lee la columna jsonb `properties.web_embeds`. Defensivo a propósito: la fila
 * puede venir de una versión anterior del formulario o de una edición a mano, y
 * un embed mal formado no debe tumbar la página pública — se descarta.
 */
export function toPropertyEmbeds(value: unknown): PropertyEmbed[] {
  if (!Array.isArray(value)) return []
  const out: PropertyEmbed[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const parsed = parseEmbedInput(typeof row.url === 'string' ? row.url : '')
    if (!parsed.ok) continue
    const placement = EMBED_PLACEMENTS.includes(row.placement as EmbedPlacement)
      ? (row.placement as EmbedPlacement)
      : 'tour'
    const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null
    out.push({ url: parsed.url, provider: parsed.provider, title, placement })
    if (out.length >= MAX_EMBEDS) break
  }
  return out
}
