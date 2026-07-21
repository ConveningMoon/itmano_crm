import 'server-only'
import sharp from 'sharp'
import { getFont } from './fonts'
import { PALETTE, CANVAS, MARGIN, ICONS } from './brand'
import type { CarouselBrandProfile, SlideCopy } from './types'

// ── Compositor determinista ──────────────────────────────────────────────────
// Renderiza un slide del sistema v2 a PNG 1080×1350 sin navegador: el texto se
// convierte a paths con opentype.js (nunca tofu, palette exacta) y sharp compone
// textura + foto opcional + capa de texto. Corre en la app desplegada (Vercel),
// sin Chromium ni Playwright.

type Font = ReturnType<typeof getFont>

const W = CANVAS.width
const H = CANVAS.height
const CX = W / 2
const CONTENT_TOP = 236     // debajo de la línea de agencia/aire superior
const CONTENT_BOTTOM = 1150 // encima del ícono/divisor/footer
const FOOTER_Y = 1286

// ── Utilidades de texto ──────────────────────────────────────────────────────

// Elimina cualquier carácter que la fuente no tenga (emojis, flechas ausentes…)
// para que nunca aparezca un glyph roto. Colapsa espacios resultantes.
function sanitize(font: Font, text: string): string {
  const kept = [...text].map((ch) => {
    if (ch === ' ' || ch === '\n') return ch
    return font.charToGlyphIndex(ch) > 0 ? ch : ''
  }).join('')
  return kept.replace(/\s+/g, ' ').trim()
}

function wrap(font: Font, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(' ').filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w
    if (font.getAdvanceWidth(trial, size) <= maxWidth || !cur) cur = trial
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

// Reduce el tamaño hasta que el texto quepa en maxLines dentro de maxWidth.
function fit(font: Font, text: string, opts: { maxWidth: number; maxLines: number; start: number; min: number }): { size: number; lines: string[] } {
  for (let s = opts.start; s >= opts.min; s -= 2) {
    const lines = wrap(font, text, s, opts.maxWidth)
    if (lines.length <= opts.maxLines) return { size: s, lines }
  }
  return { size: opts.min, lines: wrap(font, text, opts.min, opts.maxWidth) }
}

// Path de una línea centrada en centerX (kerning incluido por getPath).
function linePath(font: Font, line: string, size: number, centerX: number, baselineY: number, color: string): string {
  const width = font.getAdvanceWidth(line, size)
  const x = centerX - width / 2
  const d = font.getPath(line, x, baselineY, size).toPathData(2)
  return d ? `<path fill="${color}" d="${d}"/>` : ''
}

// Path con letter-spacing (para label y footer en Marcellus mayúsculas).
function spacedPath(font: Font, text: string, size: number, centerX: number, baselineY: number, tracking: number, color: string): string {
  const chars = [...text]
  const widths = chars.map((c) => font.getAdvanceWidth(c, size))
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1)
  let x = centerX - total / 2
  let d = ''
  chars.forEach((c, i) => {
    d += font.getPath(c, x, baselineY, size).toPathData(2) + ' '
    x += widths[i] + tracking
  })
  return `<path fill="${color}" d="${d.trim()}"/>`
}

// ── Bloques verticales (stack centrado) ──────────────────────────────────────
interface Block { lines: string[]; size: number; lineHeight: number; color: string; font: Font; gapBefore: number }
const ASCENT = 0.80

function stackSvg(blocks: Block[], area: { top: number; bottom: number }): { svg: string; bottomY: number } {
  const total = blocks.reduce((h, b) => h + b.gapBefore + b.lines.length * b.lineHeight, 0)
  const areaH = area.bottom - area.top
  let y = area.top + Math.max(0, (areaH - total) / 2)
  let svg = ''
  for (const b of blocks) {
    y += b.gapBefore
    for (const line of b.lines) {
      const baseline = y + b.size * ASCENT
      svg += linePath(b.font, line, b.size, CX, baseline, b.color)
      y += b.lineHeight
    }
  }
  return { svg, bottomY: y }
}

// ── Textura de fondo (procedural, viva, nunca plana) ─────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function textureSvg(seed: number): string {
  const rnd = mulberry32(seed * 2654435761)
  let particles = ''
  for (let i = 0; i < 52; i++) {
    const x = Math.round(rnd() * W)
    const y = Math.round(rnd() * H)
    // más tenues cerca del centro (donde va el texto)
    const distCenter = Math.hypot(x - CX, y - H / 2) / Math.hypot(CX, H / 2)
    const r = (0.8 + rnd() * 2.8).toFixed(1)
    const op = (0.04 + distCenter * 0.16 * rnd()).toFixed(3)
    const col = rnd() > 0.5 ? PALETTE.gold : PALETTE.goldDim
    particles += `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}"/>`
  }
  return `
    <defs>
      <radialGradient id="glow" cx="82%" cy="14%" r="60%">
        <stop offset="0%" stop-color="${PALETTE.gold}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${PALETTE.gold}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="12%" cy="92%" r="55%">
        <stop offset="0%" stop-color="${PALETTE.stone}" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="${PALETTE.stone}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="linen" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="16" stroke="${PALETTE.stone}" stroke-width="0.6" opacity="0.035"/>
      </pattern>
    </defs>
    <rect width="${W}" height="${H}" fill="${PALETTE.cream}"/>
    <rect width="${W}" height="${H}" fill="url(#linen)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <rect width="${W}" height="${H}" fill="url(#glow2)"/>
    ${particles}`
}

// ── Foto editorial (Nano Banana) fundida en la parte baja ────────────────────
async function fadedPhotoBand(bg: Buffer, bandHeight: number): Promise<Buffer> {
  const photo = await sharp(bg)
    .resize(W, bandHeight, { fit: 'cover', position: 'attention' })
    .modulate({ saturation: 0.94 })
    .ensureAlpha()
    .toBuffer()
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${bandHeight}">
       <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0"/>
         <stop offset="0.5" stop-color="#fff" stop-opacity="0.85"/>
         <stop offset="1" stop-color="#fff" stop-opacity="0.92"/>
       </linearGradient></defs>
       <rect width="100%" height="100%" fill="url(#f)"/>
     </svg>`,
  )
  return sharp(photo).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

// ── Íconos de línea ──────────────────────────────────────────────────────────
function iconSvg(key: string, cx: number, cy: number, box: number): string {
  const inner = ICONS[key]
  if (!inner) return ''
  const scale = box / 100
  const x = cx - box / 2
  const y = cy - box / 2
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${PALETTE.gold}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
}

function dividerSvg(y: number): string {
  return `<rect x="${CX - 38}" y="${y}" width="76" height="2" rx="1" fill="${PALETTE.gold}"/>`
}

// ── Composición de un slide ──────────────────────────────────────────────────
export async function composeSlide(slide: SlideCopy, brand: CarouselBrandProfile, bg: Buffer | null): Promise<Buffer> {
  const fTitle = getFont('title')
  const fSub = getFont('subtitle')
  const fBody = getFont('body')
  const fLabel = getFont('label')

  const maxW = W - MARGIN * 2
  const isCover = slide.slide_type === 'cover'
  const isCta = slide.slide_type === 'cta'
  const withPhoto = !!bg

  // Con foto: banda editorial abajo (PHOTO_H), texto por encima con separación
  // limpia; sin foto: el texto usa toda el área de contenido.
  const PHOTO_H = 620
  const contentBottom = withPhoto ? H - PHOTO_H - 40 : CONTENT_BOTTOM

  const blocks: Block[] = []

  // Label (gancho dorado, Marcellus mayúsculas espaciado) — se dibuja aparte
  // para poder aplicar tracking; aquí reservamos su espacio con un bloque vacío.
  const labelText = slide.label ? sanitize(fLabel, slide.label.toUpperCase()) : ''

  // Título dominante.
  let titleLines: string[] = []
  let titleSize = 0
  if (slide.title) {
    const t = sanitize(fTitle, slide.title)
    const isShort = t.length <= 14 // número/frase corta → enorme (data slides)
    const fitted = fit(fTitle, t, { maxWidth: maxW, maxLines: isShort ? 2 : 5, start: isShort ? 168 : 96, min: 44 })
    titleLines = fitted.lines
    titleSize = fitted.size
  }

  // Subtítulo.
  let subLines: string[] = []
  const subSize = 34
  if (slide.subtitle) {
    subLines = wrap(fSub, sanitize(fSub, slide.subtitle), subSize, maxW)
  }

  // Líneas de impacto / pasos.
  const lineBlocks: string[] = (slide.lines ?? []).map((l) => sanitize(fBody, l)).filter(Boolean)

  // Construcción del stack.
  if (labelText) blocks.push({ lines: [''], size: 28, lineHeight: 54, color: PALETTE.gold, font: fLabel, gapBefore: 0 })
  if (titleLines.length) blocks.push({ lines: titleLines, size: titleSize, lineHeight: titleSize * 1.12, color: PALETTE.navy, font: fTitle, gapBefore: labelText ? 6 : 0 })
  if (subLines.length) blocks.push({ lines: subLines, size: subSize, lineHeight: subSize * 1.34, color: PALETTE.navySoft, font: fSub, gapBefore: 26 })
  if (lineBlocks.length) {
    const lsize = lineBlocks.length <= 3 ? 46 : 38
    for (let i = 0; i < lineBlocks.length; i++) {
      blocks.push({ lines: wrap(fBody, lineBlocks[i], lsize, maxW), size: lsize, lineHeight: lsize * 1.28, color: i % 2 === 0 ? PALETTE.navy : PALETTE.navySoft, font: fBody, gapBefore: i === 0 ? 30 : 14 })
    }
  }

  const stack = stackSvg(blocks, { top: CONTENT_TOP, bottom: contentBottom })

  // El label real (con tracking) se dibuja centrado sobre la primera línea del stack.
  let labelSvg = ''
  if (labelText) {
    const total = blocks.reduce((h, b) => h + b.gapBefore + b.lines.length * b.lineHeight, 0)
    const areaH = contentBottom - CONTENT_TOP
    const startTop = CONTENT_TOP + Math.max(0, (areaH - total) / 2)
    labelSvg = spacedPath(fLabel, labelText, 27, CX, startTop + 27 * ASCENT, 6, PALETTE.gold)
  }

  // Divisor + ícono (data slides con ícono).
  let accentSvg = ''
  if (slide.icon && !withPhoto) {
    const dy = Math.min(stack.bottomY + 40, 1024)
    accentSvg += dividerSvg(dy)
    accentSvg += iconSvg(slide.icon, CX, dy + 96, 92)
  } else if ((isCover || isCta) && !withPhoto) {
    accentSvg += dividerSvg(Math.min(stack.bottomY + 34, 1080))
  }

  // Agencia (solo portada y cierre), arriba centrada, Marcellus dorado espaciado.
  let agencySvg = ''
  if ((isCover || isCta) && brand.agency_name) {
    agencySvg = spacedPath(fLabel, sanitize(fLabel, brand.agency_name.toUpperCase()), 21, CX, 132, 4, PALETTE.gold)
  }

  // Footer @handle en TODOS los slides. Sobre foto va en crema con scrim para
  // contraste; sobre textura va en navy.
  const footerColor = withPhoto ? PALETTE.cream : PALETTE.navy
  const footerSvg = spacedPath(fLabel, sanitize(fLabel, brand.instagram_handle.toLowerCase()), 23, CX, FOOTER_Y, 3, footerColor)

  // Capa de texto (transparente).
  const textLayer = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${agencySvg}${labelSvg}${stack.svg}${accentSvg}${footerSvg}</svg>`,
  )

  // Base + textura.
  const base = sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${textureSvg(slide.slide_number)}</svg>`,
  )).png()

  const layers: Array<{ input: Buffer; top: number; left: number }> = []
  if (bg) {
    const band = await fadedPhotoBand(bg, PHOTO_H)
    layers.push({ input: band, top: H - PHOTO_H, left: 0 })
    // Scrim inferior para que el footer crema se lea sobre la foto.
    const scrim = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
         <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="${PALETTE.navy}" stop-opacity="0"/>
           <stop offset="1" stop-color="${PALETTE.navy}" stop-opacity="0.5"/>
         </linearGradient></defs>
         <rect x="0" y="${H - 150}" width="${W}" height="150" fill="url(#s)"/>
       </svg>`,
    )
    layers.push({ input: scrim, top: 0, left: 0 })
  }
  layers.push({ input: textLayer, top: 0, left: 0 })

  return base.composite(layers).png().toBuffer()
}
