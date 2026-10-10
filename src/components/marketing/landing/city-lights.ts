// Motor del hero: el mercado visto de noche desde arriba. Cada luz es una casa
// —un lead posible—, agrupadas en barrios y alineadas en avenidas. Las que
// califican se encienden en oro y vuelan a la lista del día; al llegar,
// HeroStage inserta la fila.
//
// Canvas 2D sin dependencias. Los colores salen de los tokens del design
// system (getComputedStyle), nunca de literales. El bucle sólo corre mientras
// alguien lo llama con play(): HeroStage lo pausa fuera de pantalla, con la
// pestaña oculta y con prefers-reduced-motion (ahí pinta un solo cuadro).

type RGB = readonly [number, number, number]

interface Light {
  x: number
  y: number
  r: number
  alpha: number
  phase: number
  speed: number
  depth: number
  tone: 'warm' | 'gold' | 'cold'
  busy: boolean
  /** 0 → 1 mientras reaparece después de volar. */
  bornAt: number
}

interface Flight {
  light: Light
  sx: number
  sy: number
  cx: number
  cy: number
  tx: number
  ty: number
  start: number
  trail: { x: number; y: number }[]
  onArrive: () => void
  arrived: boolean
}

interface Burst {
  x: number
  y: number
  start: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const IGNITE_MS = 320
const TRAVEL_MS = 1150
const BURST_MS = 520
const REBORN_MS = 1400
const TRAIL_POINTS = 16
const SPRITE = 64

// PRNG con semilla: la ciudad es la misma en cada visita y en cada resize.
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function parseColor(value: string): RGB | null {
  const v = value.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map(p => parseFloat(p))
    if ([r, g, b].every(Number.isFinite)) return [r, g, b]
  }
  return null
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const inside = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export class CityLights {
  private ctx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private dpr = 1
  private lights: Light[] = []
  private flights: Flight[] = []
  private bursts: Burst[] = []
  private sprites: Record<Light['tone'], HTMLCanvasElement>
  private colors: Record<Light['tone'], RGB>
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 }
  private avoid: Rect[] = []
  /** Resplandor de cada barrio: el halo cálido de una zona poblada vista de noche. */
  private glows: { x: number; y: number; s: number }[] = []
  private raf = 0
  private playing = false
  private rand = mulberry32(7)

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D no disponible')
    this.ctx = ctx

    const css = getComputedStyle(canvas)
    const token = (name: string, fallback: RGB) => parseColor(css.getPropertyValue(name)) ?? fallback
    this.colors = {
      warm: token('--text-primary', [232, 230, 225]),
      gold: token('--accent-gold', [201, 169, 110]),
      cold: token('--accent-blue', [91, 142, 201]),
    }
    this.sprites = {
      warm: this.makeSprite(this.colors.warm),
      gold: this.makeSprite(this.colors.gold),
      cold: this.makeSprite(this.colors.cold),
    }
  }

  // Un punto de luz pre-pintado: núcleo nítido y halo suave. drawImage de un
  // sprite cuesta mucho menos que un radial-gradient por luz y por cuadro.
  private makeSprite([r, g, b]: RGB) {
    const c = document.createElement('canvas')
    c.width = c.height = SPRITE
    const x = c.getContext('2d')!
    const half = SPRITE / 2
    const grad = x.createRadialGradient(half, half, 0, half, half, half)
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`)
    grad.addColorStop(0.16, `rgba(${r},${g},${b},0.95)`)
    grad.addColorStop(0.32, `rgba(${r},${g},${b},0.32)`)
    grad.addColorStop(0.6, `rgba(${r},${g},${b},0.06)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    x.fillStyle = grad
    x.fillRect(0, 0, SPRITE, SPRITE)
    return c
  }

  setSize(width: number, height: number) {
    this.w = width
    this.h = height
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    this.canvas.width = Math.round(width * this.dpr)
    this.canvas.height = Math.round(height * this.dpr)
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.flights = []
    this.bursts = []
    this.build()
    if (!this.playing) this.frame(performance.now())
  }

  /** Zonas donde no conviene que despegue una luz (el titular, la lista). */
  setAvoid(rects: Rect[]) {
    this.avoid = rects
  }

  /** Puntero normalizado a -1…1 para el parallax por profundidad. */
  setPointer(nx: number, ny: number) {
    this.pointer.tx = nx
    this.pointer.ty = ny
  }

  private build() {
    this.rand = mulberry32(7)
    const rand = this.rand
    const { w, h } = this
    const lights: Light[] = []
    const area = w * h
    const make = (x: number, y: number, small: boolean): Light => {
      const roll = rand()
      return {
        x,
        y,
        r: small ? 0.6 + rand() * 0.6 : 0.8 + rand() * 1.5,
        alpha: small ? 0.3 + rand() * 0.35 : 0.35 + rand() * 0.6,
        phase: rand() * Math.PI * 2,
        speed: 0.4 + rand() * 1.4,
        depth: rand(),
        tone: roll > 0.93 ? 'gold' : roll > 0.85 ? 'cold' : 'warm',
        busy: false,
        bornAt: -Infinity,
      }
    }

    // Avenidas: hileras de luces sobre curvas suaves que cruzan el cuadro,
    // como el alumbrado de una autopista vista desde el aire.
    const avenues = w < 700 ? 2 : 3
    for (let i = 0; i < avenues; i++) {
      const y0 = h * (0.15 + rand() * 0.7)
      const y1 = h * (0.15 + rand() * 0.7)
      const cy = (y0 + y1) / 2 + (rand() - 0.5) * h * 0.5
      const steps = Math.floor(w / 11)
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const x = t * w + (rand() - 0.5) * 4
        const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1
        if (rand() > 0.12) lights.push(make(x, y + (rand() - 0.5) * 3, true))
      }
    }

    // Barrios: núcleos densos con densidad que cae hacia afuera.
    // Más barrios hacia la derecha: la izquierda queda bajo el velo del titular.
    const hoods = Math.max(6, Math.round(area / 90_000))
    const clustered = Math.min(420, Math.max(120, Math.round(area / 3400)))
    const centers = Array.from({ length: hoods }, () => ({
      x: w * (0.08 + Math.sqrt(rand()) * 0.9),
      y: h * (0.08 + rand() * 0.84),
      s: Math.min(w, h) * (0.05 + rand() * 0.09),
    }))
    this.glows = centers.map(c => ({ x: c.x, y: c.y, s: c.s * 5 }))
    for (let i = 0; i < clustered; i++) {
      const c = centers[i % hoods]
      // Box–Muller: gaussiana alrededor del centro del barrio.
      const u = Math.max(rand(), 1e-6)
      const v = rand()
      const mag = Math.sqrt(-2 * Math.log(u)) * c.s
      const x = c.x + mag * Math.cos(2 * Math.PI * v)
      const y = c.y + mag * Math.sin(2 * Math.PI * v)
      if (x > 0 && x < w && y > 0 && y < h) lights.push(make(x, y, false))
    }

    // Casas sueltas entre barrio y barrio.
    const scattered = Math.round(clustered * 0.45)
    for (let i = 0; i < scattered; i++) lights.push(make(rand() * w, rand() * h, rand() > 0.4))

    this.lights = lights
  }

  /**
   * Enciende una luz y la manda a (tx, ty). Devuelve false si no hay ninguna
   * disponible; onArrive corre una sola vez, al tocar el destino.
   */
  launch(tx: number, ty: number, onArrive: () => void): boolean {
    const now = performance.now()
    const minDist = Math.min(this.w, this.h) * 0.35
    const candidates = this.lights.filter(
      l =>
        !l.busy &&
        l.tone !== 'cold' &&
        now - l.bornAt > REBORN_MS &&
        Math.hypot(l.x - tx, l.y - ty) > minDist &&
        !this.avoid.some(r => inside(l.x, l.y, r)),
    )
    if (candidates.length === 0) return false
    const light = candidates[Math.floor(this.rand() * candidates.length)]
    light.busy = true

    const sx = light.x
    const sy = light.y
    // Arco hacia arriba: la luz "sube" antes de bajar a su fila.
    const cx = (sx + tx) / 2 + (this.rand() - 0.5) * this.w * 0.12
    const cy = Math.min(sy, ty) - this.h * (0.18 + this.rand() * 0.12)
    this.flights.push({ light, sx, sy, cx, cy, tx, ty, start: now, trail: [], onArrive, arrived: false })
    if (!this.playing) this.frame(now)
    return true
  }

  play() {
    if (this.playing) return
    this.playing = true
    const loop = (t: number) => {
      if (!this.playing) return
      this.frame(t)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  pause() {
    this.playing = false
    cancelAnimationFrame(this.raf)
  }

  destroy() {
    this.pause()
    this.flights = []
    this.lights = []
  }

  private frame(now: number) {
    const { ctx, w, h } = this
    const p = this.pointer
    p.x += (p.tx - p.x) * 0.05
    p.y += (p.ty - p.y) * 0.05

    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    const time = now / 1000

    ctx.globalAlpha = 0.07
    for (const g of this.glows) {
      ctx.drawImage(this.sprites.gold, g.x + p.x * 4 - g.s / 2, g.y + p.y * 3 - g.s / 2, g.s, g.s)
    }

    for (const l of this.lights) {
      if (l.busy) continue
      const born = Math.min(1, (now - l.bornAt) / REBORN_MS)
      const twinkle = 0.72 + 0.28 * Math.sin(time * l.speed + l.phase)
      const a = l.alpha * twinkle * (born < 1 ? easeOut(born) : 1)
      if (a < 0.02) continue
      const size = l.r * 8
      const x = l.x + p.x * l.depth * 12
      const y = l.y + p.y * l.depth * 8
      ctx.globalAlpha = a
      ctx.drawImage(this.sprites[l.tone], x - size / 2, y - size / 2, size, size)
    }

    this.flights = this.flights.filter(f => this.drawFlight(f, now))

    this.bursts = this.bursts.filter(b => {
      const t = (now - b.start) / BURST_MS
      if (t >= 1) return false
      const [r, g, bl] = this.colors.gold
      ctx.globalAlpha = 1
      ctx.strokeStyle = `rgba(${r},${g},${bl},${(1 - t) * 0.7})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(b.x, b.y, 4 + easeOut(t) * 20, 0, Math.PI * 2)
      ctx.stroke()
      return true
    })

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }

  private drawFlight(f: Flight, now: number): boolean {
    const { ctx } = this
    const elapsed = now - f.start
    const ignite = Math.min(1, elapsed / IGNITE_MS)
    const travel = Math.max(0, Math.min(1, (elapsed - IGNITE_MS) / TRAVEL_MS))
    const t = easeInOut(travel)

    const x = (1 - t) * (1 - t) * f.sx + 2 * (1 - t) * t * f.cx + t * t * f.tx
    const y = (1 - t) * (1 - t) * f.sy + 2 * (1 - t) * t * f.cy + t * t * f.ty

    if (travel > 0) {
      f.trail.push({ x, y })
      if (f.trail.length > TRAIL_POINTS) f.trail.shift()
    }

    // Estela: segmentos que se adelgazan y apagan hacia atrás.
    const [r, g, b] = this.colors.gold
    for (let i = 1; i < f.trail.length; i++) {
      const k = i / f.trail.length
      ctx.globalAlpha = 1
      ctx.strokeStyle = `rgba(${r},${g},${b},${k * 0.55})`
      ctx.lineWidth = k * 2.2
      ctx.beginPath()
      ctx.moveTo(f.trail[i - 1].x, f.trail[i - 1].y)
      ctx.lineTo(f.trail[i].x, f.trail[i].y)
      ctx.stroke()
    }

    // Encendido: el color propio de la casa cede al oro mientras crece.
    const glow = easeOut(ignite)
    const size = f.light.r * 8 * (1 + glow * 1.8)
    if (glow < 1 && f.light.tone !== 'gold') {
      ctx.globalAlpha = 1 - glow
      ctx.drawImage(this.sprites[f.light.tone], x - size / 2, y - size / 2, size, size)
    }
    ctx.globalAlpha = Math.max(glow, 0.35)
    ctx.drawImage(this.sprites.gold, x - size / 2, y - size / 2, size, size)

    if (travel >= 1 && !f.arrived) {
      f.arrived = true
      this.bursts.push({ x: f.tx, y: f.ty, start: now })
      f.onArrive()
      // La casa vuelve a aparecer en otro punto de la ciudad.
      const l = f.light
      l.x = this.rand() * this.w
      l.y = this.rand() * this.h
      l.busy = false
      l.bornAt = now
      return false
    }
    return true
  }
}
