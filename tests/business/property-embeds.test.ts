import { describe, it, expect } from 'vitest'
import {
  parseEmbedInput, toPropertyEmbeds, embedAspectRatio, PROVIDER_LABEL, MAX_EMBEDS,
} from '@/lib/services/property-embeds'

// El agente pega lo que le da el botón de compartir del proveedor. De ese texto
// sale UNA url y nada más: el HTML no se guarda ni se vuelve a renderizar, que
// es lo único que impide que un agente inyecte <script> en la página pública
// del cliente.

const ZILLOW_SNIPPET = `<iframe src="https://www.zillow.com/view-imx/10faef5d-b5a1-42a1-8b54-b1a8ac4cbf17?initialViewType=pano" width="640" height="360"
                                            style="border: 0;" allow="fullscreen"></iframe>`
const ZILLOW_URL = 'https://www.zillow.com/view-imx/10faef5d-b5a1-42a1-8b54-b1a8ac4cbf17?initialViewType=pano'

function url(raw: string): string {
  const r = parseEmbedInput(raw)
  if (!r.ok) throw new Error(`esperaba ok, dio: ${r.error}`)
  return r.url
}

describe('parseEmbedInput — del snippet pegado sale una url', () => {
  it('acepta el iframe de Zillow tal como lo entrega su botón de compartir', () => {
    const r = parseEmbedInput(ZILLOW_SNIPPET)
    expect(r).toEqual({ ok: true, url: ZILLOW_URL, provider: 'zillow' })
  })

  it('acepta la url pelada igual que el snippet', () => {
    expect(parseEmbedInput(ZILLOW_URL)).toEqual({ ok: true, url: ZILLOW_URL, provider: 'zillow' })
  })

  it('tolera comillas simples y atributos en cualquier orden', () => {
    const raw = `<iframe width='640' allowfullscreen src='https://my.matterport.com/show/?m=abc123' height='360'></iframe>`
    expect(parseEmbedInput(raw)).toEqual({
      ok: true, url: 'https://my.matterport.com/show/?m=abc123', provider: 'matterport',
    })
  })

  it('decodifica las entidades del src pegado', () => {
    // Copiar desde una página ya renderizada trae &amp; en vez de &; sin
    // decodificar, el segundo parámetro se pierde y el tour abre en otra vista.
    const raw = `<iframe src="https://www.zillow.com/view-imx/abc?initialViewType=pano&amp;wl=true"></iframe>`
    expect(url(raw)).toBe('https://www.zillow.com/view-imx/abc?initialViewType=pano&wl=true')
  })

  it('se queda con el src y descarta todo lo que venga alrededor', () => {
    // La prueba que importa: el <script> no sobrevive porque NADA del HTML
    // sobrevive — sólo se extrae la url y después se valida el host.
    const raw = `<script>alert(1)</script><iframe onload="steal()" src="https://my.matterport.com/show/?m=abc123"></iframe>`
    expect(parseEmbedInput(raw)).toEqual({
      ok: true, url: 'https://my.matterport.com/show/?m=abc123', provider: 'matterport',
    })
  })
})

describe('parseEmbedInput — lista blanca de proveedores', () => {
  it('rechaza un host que no está en la lista', () => {
    const r = parseEmbedInput('https://tours.example.com/embed/abc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no est[áa] en la lista|no admitido/i)
  })

  it('rechaza un host que sólo termina parecido al permitido', () => {
    // `evil-zillow.com` y `zillow.com.attacker.net` pasan un endsWith ingenuo.
    expect(parseEmbedInput('https://evil-zillow.com/view-imx/abc').ok).toBe(false)
    expect(parseEmbedInput('https://www.zillow.com.attacker.net/view-imx/abc').ok).toBe(false)
  })

  it('rechaza esquemas que no son http(s)', () => {
    expect(parseEmbedInput('javascript:alert(1)').ok).toBe(false)
    expect(parseEmbedInput('data:text/html,<script>alert(1)</script>').ok).toBe(false)
    expect(parseEmbedInput(`<iframe src="javascript:alert(1)"></iframe>`).ok).toBe(false)
  })

  it('rechaza una url con credenciales', () => {
    // https://www.zillow.com@evil.com/ se lee como zillow a ojo y no lo es.
    expect(parseEmbedInput('https://user:pass@www.zillow.com/view-imx/abc').ok).toBe(false)
  })

  it('rechaza vacío y basura', () => {
    expect(parseEmbedInput('').ok).toBe(false)
    expect(parseEmbedInput('   ').ok).toBe(false)
    expect(parseEmbedInput('no soy una url').ok).toBe(false)
    expect(parseEmbedInput(`<iframe width="640"></iframe>`).ok).toBe(false)
  })

  it('rechaza una url más larga que la columna', () => {
    expect(parseEmbedInput(`https://www.zillow.com/view-imx/${'a'.repeat(600)}`).ok).toBe(false)
  })
})

describe('parseEmbedInput — la url tiene que ser la que se puede embeber', () => {
  it('rechaza la ficha normal de Zillow y lo dice', () => {
    // Zillow bloquea el framing de /homedetails/; guardarla dejaría un recuadro
    // en blanco en la web del cliente sin un solo error en ningún lado.
    const r = parseEmbedInput('https://www.zillow.com/homedetails/123-Main-St/12345_zpid/')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/tour|recorrido/i)
  })

  it('convierte el enlace normal de YouTube al de embeber', () => {
    expect(url('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(url('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    expect(url('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('convierte el enlace normal de Vimeo al del reproductor', () => {
    expect(url('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(url('https://player.vimeo.com/video/76979871')).toBe('https://player.vimeo.com/video/76979871')
  })

  it('acepta el embed de Google Maps y rechaza el enlace de compartir', () => {
    expect(parseEmbedInput('https://www.google.com/maps/embed?pb=!1m18!1m12').ok).toBe(true)
    expect(parseEmbedInput('https://maps.app.goo.gl/abc123').ok).toBe(false)
  })
})

describe('parseEmbedInput — normalización', () => {
  it('sube http a https', () => {
    expect(url('http://www.zillow.com/view-imx/abc')).toBe('https://www.zillow.com/view-imx/abc')
  })

  it('no distingue mayúsculas en el host', () => {
    expect(url('https://WWW.Zillow.COM/view-imx/abc')).toBe('https://www.zillow.com/view-imx/abc')
  })

  it('conserva la query, que es donde vive el identificador del tour', () => {
    expect(url('https://my.matterport.com/show/?m=abc123&play=1')).toBe('https://my.matterport.com/show/?m=abc123&play=1')
  })
})

describe('toPropertyEmbeds — leer la columna jsonb', () => {
  it('devuelve lista vacía para cualquier cosa que no sea un array', () => {
    expect(toPropertyEmbeds(null)).toEqual([])
    expect(toPropertyEmbeds(undefined)).toEqual([])
    expect(toPropertyEmbeds({})).toEqual([])
    expect(toPropertyEmbeds('[]')).toEqual([])
  })

  it('revalida cada url y descarta la que ya no pasa', () => {
    // Una fila editada a mano, o guardada antes de que el host saliera de la
    // lista, no debe tumbar la página pública: se cae ese embed, no la ficha.
    const rows = [
      { url: ZILLOW_URL, placement: 'tour', title: 'Recorrido 3D' },
      { url: 'https://tours.example.com/x', placement: 'tour', title: null },
      { url: 'javascript:alert(1)', placement: 'extra' },
      'no soy un objeto',
    ]
    expect(toPropertyEmbeds(rows)).toEqual([
      { url: ZILLOW_URL, provider: 'zillow', title: 'Recorrido 3D', placement: 'tour' },
    ])
  })

  it('deriva el proveedor de la url, no de lo que diga la fila', () => {
    const [e] = toPropertyEmbeds([{ url: ZILLOW_URL, provider: 'youtube', placement: 'extra' }])
    expect(e.provider).toBe('zillow')
    expect(e.placement).toBe('extra')
  })

  it('cae a la sección del recorrido si la ubicación no es válida', () => {
    const [e] = toPropertyEmbeds([{ url: ZILLOW_URL, placement: 'inventada' }])
    expect(e.placement).toBe('tour')
  })

  it('corta en el tope aunque la fila traiga más', () => {
    const many = Array.from({ length: MAX_EMBEDS + 4 }, () => ({ url: ZILLOW_URL, placement: 'tour' }))
    expect(toPropertyEmbeds(many)).toHaveLength(MAX_EMBEDS)
  })
})

describe('presentación', () => {
  it('cada proveedor tiene etiqueta legible', () => {
    expect(PROVIDER_LABEL.zillow).toBeTruthy()
    expect(PROVIDER_LABEL.matterport).toBeTruthy()
  })

  it('el mapa es 4/3 y el resto 16/9', () => {
    expect(embedAspectRatio('gmaps')).toBe('4 / 3')
    expect(embedAspectRatio('zillow')).toBe('16 / 9')
    expect(embedAspectRatio('youtube')).toBe('16 / 9')
  })

  it('el tope por propiedad es un número usable', () => {
    expect(MAX_EMBEDS).toBeGreaterThan(1)
    expect(MAX_EMBEDS).toBeLessThanOrEqual(12)
  })
})
