import 'server-only'
import sharp from 'sharp'
import { CANVAS, MARGIN, textBand, resolveZone } from './canvas'
import { getStudioFont, sanitize, wrap, fit, ellipsize, textPath } from './typeset'
import { formatDate, formatMoney } from './format'
import type { StudioForm } from './recipes'
import type { StudioBrand, TextZone } from './types'

// ── Compositor del Estudio ───────────────────────────────────────────────────
// La mitad determinista del pipeline: los datos exactos (precio, fecha,
// dirección) se dibujan AQUÍ, con la marca del tenant, sobre la banda que el
// director de prompt dejó limpia. El modelo nunca escribe texto — se equivoca
// con acentos y cifras, y una fecha mal escrita en material de marca no es un
// defecto estético sino un error que el agente publica con su nombre.

const ASCENT = 0.80
const INK      = '#FFFFFF'   // texto sobre foto: blanco con scrim detrás
const INK_SOFT = '#E8E3DA'

// Etiqueta fija por receta. Ninguna lleva las palabras "precio" ni "costo"
// (regla de voz de marca): los listados muestran la cifra sola.
const BADGE: Record<StudioForm['recipe'], string | null> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       null,   // el título ya manda
  open_prompt: null,
}

function formatSpecs(f: Extract<StudioForm, { recipe: 'new_listing' }>): string {
  const parts: string[] = []
  if (f.bedrooms !== undefined) parts.push(`${f.bedrooms} hab`)
  if (f.bathrooms !== undefined) parts.push(`${f.bathrooms} baños`)
  if (f.sqft !== undefined) parts.push(`${f.sqft.toLocaleString('en-US')} sqft`)
  return parts.join('  ·  ')
}

// ── Lo que lleva escrito cada receta ─────────────────────────────────────────
interface Piece { text: string; role: 'badge' | 'hero' | 'lead' | 'detail' }

function piecesFor(form: StudioForm): Piece[] {
  const badge = BADGE[form.recipe]
  const out: Piece[] = badge ? [{ text: badge, role: 'badge' }] : []

  switch (form.recipe) {
    case 'open_house':
      out.push({ text: formatDate(form.date), role: 'hero' })
      out.push({ text: `${form.time_start} – ${form.time_end}`, role: 'lead' })
      out.push({ text: form.address, role: 'detail' })
      if (form.refreshments) out.push({ text: 'Con refrigerios', role: 'detail' })
      break
    case 'new_listing': {
      out.push({ text: formatMoney(form.price), role: 'hero' })
      out.push({ text: form.address, role: 'lead' })
      const specs = formatSpecs(form)
      if (specs) out.push({ text: specs, role: 'detail' })
      if (form.highlights.length) out.push({ text: form.highlights.join('  ·  '), role: 'detail' })
      break
    }
    case 'sold':
      out.push({ text: form.address, role: 'hero' })
      if (form.show_price && form.price !== undefined) out.push({ text: formatMoney(form.price), role: 'lead' })
      if (form.note) out.push({ text: form.note, role: 'detail' })
      break
    case 'event':
      out.push({ text: form.title, role: 'hero' })
      out.push({ text: `${formatDate(form.date)}  ·  ${form.time_start}`, role: 'lead' })
      out.push({ text: form.venue, role: 'detail' })
      out.push({ text: form.is_free ? 'Entrada libre' : formatMoney(form.price ?? 0), role: 'detail' })
      if (form.signup) out.push({ text: form.signup, role: 'detail' })
      break
    case 'open_prompt':
      // Devuelve la imagen limpia: sin texto, sin scrim, sin marca.
      break
  }
  return out
}

// Pie con la marca: agente, teléfono y agencia. Todo sale de la base.
function footerText(brand: StudioBrand): string {
  return [brand.agent_name, brand.agent_phone, brand.tenant_name].filter(Boolean).join('  ·  ')
}

// ── Fondo procedural (degradación cuando no hay imagen) ──────────────────────
function proceduralSvg(W: number, H: number, accent: string): string {
  return `
    <defs>
      <linearGradient id="p" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}" stop-opacity="1"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0.72"/>
      </linearGradient>
      <pattern id="linen" width="18" height="18" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="18" stroke="#FFFFFF" stroke-width="0.7" opacity="0.05"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="#000000"/>
    <rect width="${W}" height="${H}" fill="url(#p)"/>
    <rect width="${W}" height="${H}" fill="url(#linen)"/>`
}

// Degradado sobre la banda para que el texto se lea encima de una foto que
// nadie controló. Es lo que hace viable el modo 'photo'.
function scrimSvg(W: number, H: number, band: { x: number; y: number; width: number; height: number }, zone: TextZone): string {
  const pad = 60
  if (zone === 'left') {
    return `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.68"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </linearGradient></defs>
      <rect x="0" y="0" width="${band.x + band.width + pad}" height="${H}" fill="url(#s)"/>`
  }
  const top = zone === 'top'
  const y = top ? 0 : band.y - pad
  const h = top ? band.y + band.height + pad : H - (band.y - pad)
  return `<defs><linearGradient id="s" x1="0" y1="${top ? 1 : 0}" x2="0" y2="${top ? 0 : 1}">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.72"/>
    </linearGradient></defs>
    <rect x="0" y="${y}" width="${W}" height="${h}" fill="url(#s)"/>`
}

// ── Composición ──────────────────────────────────────────────────────────────
export async function composeStudioImage(params: {
  form:       StudioForm
  brand:      StudioBrand
  background: Buffer | null
  textZone:   TextZone
}): Promise<Buffer> {
  const { form, brand, background } = params
  const { width: W, height: H } = CANVAS[form.aspect]
  const zone = resolveZone(form.aspect, params.textZone)
  const band = textBand(form.aspect, zone)

  const fHero  = getStudioFont('title')
  const fLead  = getStudioFont('subtitle')
  const fBody  = getStudioFont('body')
  const fLabel = getStudioFont('label')

  // Base: la escena/foto, o el fondo procedural con el color del tenant.
  const base = background
    ? sharp(background).resize(W, H, { fit: 'cover', position: 'attention' }).png()
    : sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${proceduralSvg(W, H, brand.primary_color)}</svg>`,
      )).png()

  const pieces = piecesFor(form)
  if (pieces.length === 0) return base.toBuffer()

  // Trazado del bloque de texto, de arriba hacia abajo dentro de la banda.
  let y = band.y
  let svg = ''

  for (const piece of pieces) {
    if (piece.role === 'badge') {
      const text = sanitize(fLabel, piece.text)
      if (!text) continue
      const size = 26
      svg += textPath(fLabel, text.toUpperCase(), size, band.x, y + size * ASCENT, INK, { tracking: 6 })
      y += size * 2.1
      continue
    }
    if (piece.role === 'hero') {
      const text = sanitize(fHero, piece.text)
      if (!text) continue
      const short = text.length <= 16
      const r = fit(fHero, text, { maxWidth: band.width, maxLines: short ? 1 : 2, start: short ? 118 : 74, min: 42 })
      for (const line of r.lines) {
        svg += textPath(fHero, line, r.size, band.x, y + r.size * ASCENT, INK)
        y += r.size * 1.12
      }
      y += 14
      continue
    }
    if (piece.role === 'lead') {
      const text = sanitize(fLead, piece.text)
      if (!text) continue
      const size = 40
      for (const line of ellipsize(fLead, text, size, band.width, 2)) {
        svg += textPath(fLead, line, size, band.x, y + size * ASCENT, INK)
        y += size * 1.24
      }
      y += 8
      continue
    }
    const text = sanitize(fBody, piece.text)
    if (!text) continue
    const size = 28
    for (const line of ellipsize(fBody, text, size, band.width, 2)) {
      svg += textPath(fBody, line, size, band.x, y + size * ASCENT, INK_SOFT)
      y += size * 1.3
    }
  }

  // Pie de marca, pegado al borde inferior del lienzo (en story, por encima del
  // área que tapa la interfaz de Instagram).
  const footer = sanitize(fLabel, footerText(brand))
  if (footer) {
    const size = 22
    const line = wrap(fLabel, footer, size, W - MARGIN * 2)[0] ?? footer
    const fy = H - (form.aspect === '9:16' ? 150 : MARGIN)
    svg += textPath(fLabel, line, size, band.x, fy, INK_SOFT, { tracking: 2, opacity: 0.9 })
  }

  const layers: Array<{ input: Buffer; top: number; left: number }> = [
    { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${scrimSvg(W, H, band, zone)}</svg>`), top: 0, left: 0 },
    { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`), top: 0, left: 0 },
  ]

  return base.composite(layers).png().toBuffer()
}
