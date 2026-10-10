'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useInView } from 'motion/react'
import { Bell, CornerDownLeft, Sparkles, UserPlus } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'

// La plataforma como un plano: celdas de distinto tamaño separadas por una
// línea fina, cada una con una muestra del producto haciendo su trabajo. Las
// muestras que se mueven sólo corren mientras están en pantalla. Datos
// ficticios, igual que el resto de la landing.

/** true mientras el elemento está en pantalla y el visitante acepta movimiento. */
function useLive(ref: React.RefObject<Element | null>) {
  const inView = useInView(ref, { margin: '-10% 0px -10% 0px' })
  const reduced = usePrefersReducedMotion()
  return inView && !reduced
}

/** true desde la primera vez que entra en pantalla (y siempre con reduced motion). */
function useArrived(ref: React.RefObject<Element | null>) {
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const reduced = usePrefersReducedMotion()
  return inView || reduced
}

function useTicker(live: boolean, every: number, onTick: () => void) {
  const tick = useRef(onTick)
  useEffect(() => {
    tick.current = onTick
  })
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => tick.current(), every)
    return () => window.clearInterval(id)
  }, [live, every])
}

// ── Captación ────────────────────────────────────────────────────────────────

const SOURCES = [
  { name: 'Formulario de tu web', count: 52 },
  { name: 'Guía para vendedores', count: 38 },
  { name: 'Valoración gratuita', count: 21 },
  { name: 'Open house · Calle Olmo 12', count: 17 },
  { name: 'Newsletter', count: 9 },
]

function SourcesDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [counts, setCounts] = useState(() => SOURCES.map(s => s.count))
  const [ping, setPing] = useState<{ index: number; n: number } | null>(null)
  const cursor = useRef(0)

  useTicker(live, 1900, () => {
    // Recorrido fijo, no aleatorio: el mismo en cada visita.
    const order = [1, 0, 3, 2, 0, 4, 1]
    const index = order[cursor.current++ % order.length]
    setCounts(prev => prev.map((c, i) => (i === index ? c + 1 : c)))
    setPing(prev => ({ index, n: (prev?.n ?? 0) + 1 }))
  })

  const max = Math.max(...counts)
  return (
    <div ref={ref} className="mk-demo mk-sources">
      {SOURCES.map((s, i) => (
        <div key={s.name} className="mk-sources-row" data-ping={ping?.index === i || undefined}>
          <span className="mk-sources-name">{s.name}</span>
          <span className="mk-sources-bar" aria-hidden>
            <m.span
              className="mk-sources-fill"
              animate={{ scaleX: counts[i] / max }}
              transition={{ duration: 0.6, ease: EASE_OUT_PREMIUM }}
            />
          </span>
          <span className="mk-sources-count mk-num">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={counts[i]}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT_PREMIUM }}
                style={{ display: 'inline-block' }}
              >
                {counts[i]}
              </m.span>
            </AnimatePresence>
          </span>
          {ping?.index === i && <span key={ping.n} className="mk-sources-ping" aria-hidden />}
        </div>
      ))}
    </div>
  )
}

// ── Avisos ───────────────────────────────────────────────────────────────────

const ALERTS = [
  { icon: Bell, title: 'Lead caliente', body: 'Mariana González pidió la valoración de su casa.' },
  { icon: CornerDownLeft, title: 'Respondió tu correo', body: 'Jorge Lira: “¿Podemos vernos el jueves?”' },
  { icon: UserPlus, title: 'Nuevo lead', body: 'Diego Ramos confirmó el open house del sábado.' },
  { icon: Bell, title: 'Lead caliente', body: 'Valeria Pardo volvió a ver la ficha de Olmo 12.' },
  { icon: UserPlus, title: 'Nuevo lead', body: 'Camila Soto descargó tu guía para compradores.' },
]

function AlertsDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [head, setHead] = useState(0)
  useTicker(live, 2600, () => setHead(h => h + 1))
  const stack = [0, 1, 2].map(k => ({ ...ALERTS[(head + 2 - k) % ALERTS.length], key: head + 2 - k }))

  return (
    <div ref={ref} className="mk-demo mk-alerts">
      <AnimatePresence initial={false} mode="popLayout">
        {stack.map((a, i) => (
          <m.div
            key={a.key}
            layout
            className="mk-alert"
            initial={{ opacity: 0, y: -18, scale: 0.97, filter: 'blur(6px)' }}
            animate={{ opacity: 1 - i * 0.28, y: 0, scale: 1 - i * 0.025, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
            transition={{ duration: 0.5, ease: EASE_OUT_PREMIUM }}
          >
            <span className="mk-alert-icon">
              <a.icon size={14} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="mk-alert-text">
              <strong>{a.title}</strong>
              <span>{a.body}</span>
            </span>
            <span className="mk-alert-time">ahora</span>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ── Newsletter ───────────────────────────────────────────────────────────────

function NewsletterDemo() {
  return (
    <div className="mk-demo mk-edition">
      <div className="mk-edition-mast">
        <span>Tu agencia</span>
        <span>El mercado este mes</span>
      </div>
      <p className="mk-edition-title">Por qué este otoño conviene listar antes de diciembre</p>
      <p className="mk-edition-by">Laura Méndez · 4 min de lectura</p>
      <div className="mk-edition-sub">
        <span>tu@email.com</span>
        <span className="mk-edition-btn">Suscribirme</span>
      </div>
      <p className="mk-edition-url">news.itmano.com/tu-agencia</p>
    </div>
  )
}

// ── Open house ───────────────────────────────────────────────────────────────

const START_IN = 2 * 86400 + 14 * 3600 + 6 * 60 + 12

function OpenHouseDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [left, setLeft] = useState(START_IN)
  useTicker(live, 1000, () => setLeft(s => (s > 0 ? s - 1 : START_IN)))

  const d = Math.floor(left / 86400)
  const h = Math.floor((left % 86400) / 3600)
  const min = Math.floor((left % 3600) / 60)
  const s = left % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div ref={ref} className="mk-demo mk-openhouse">
      <div className="mk-openhouse-when">
        <span className="mk-openhouse-day">Sábado</span>
        <span>11:00 a 14:00 · Calle Olmo 12</span>
      </div>
      <div className="mk-openhouse-clock mk-num" aria-label="Cuenta regresiva de ejemplo">
        {[
          [d, 'días'],
          [pad(h), 'horas'],
          [pad(min), 'min'],
          [pad(s), 'seg'],
        ].map(([value, unit]) => (
          <span key={unit} className="mk-openhouse-unit">
            <strong>{value}</strong>
            <span>{unit}</span>
          </span>
        ))}
      </div>
      <div className="mk-openhouse-rsvp">
        <span className="mk-openhouse-faces" aria-hidden>
          {['teal', 'coral', 'blue'].map(t => (
            <span key={t} style={{ ['--tone' as string]: `var(--accent-${t})` }} />
          ))}
        </span>
        <span>
          <strong className="mk-num">18</strong> confirmaron asistencia
        </span>
      </div>
    </div>
  )
}

// ── Propiedad ────────────────────────────────────────────────────────────────

function PropertyDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const on = useArrived(ref)
  return (
    <div ref={ref} className="mk-demo mk-property">
      <span className="mk-property-ai">
        <Sparkles size={13} strokeWidth={1.75} aria-hidden /> Creada con IA desde el PDF
      </span>
      <p className="mk-property-price mk-num">$485,000</p>
      <p className="mk-property-meta">3 habitaciones · 2 baños · 168 m²</p>
      <div className="mk-property-media">
        <span>Fotos</span>
        <span>Tour 3D</span>
        <span>Video</span>
      </div>
      <div className="mk-property-toggle" data-on={on || undefined}>
        <span className="mk-switch" aria-hidden>
          <span />
        </span>
        Publicada en tu web
      </div>
    </div>
  )
}

// ── Analytics ────────────────────────────────────────────────────────────────

const CHANNELS = [
  { name: 'Guía para vendedores', arrived: 38, advanced: 15 },
  { name: 'Formulario de tu web', arrived: 52, advanced: 9 },
  { name: 'Open house', arrived: 17, advanced: 8 },
]

function AnalyticsDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const on = useArrived(ref)
  const max = Math.max(...CHANNELS.map(c => c.arrived))
  return (
    <div ref={ref} className="mk-demo mk-channels">
      {CHANNELS.map((c, i) => (
        <div key={c.name} className="mk-channel">
          <div className="mk-channel-head">
            <span>{c.name}</span>
            <span className="mk-num">
              {c.advanced} de {c.arrived} avanzaron
            </span>
          </div>
          <div className="mk-channel-bar" aria-hidden>
            <m.span
              className="mk-channel-arrived"
              initial={false}
              animate={{ scaleX: on ? c.arrived / max : 0 }}
              transition={{ duration: 0.7, delay: i * 0.08, ease: EASE_OUT_PREMIUM }}
            />
            <m.span
              className="mk-channel-advanced"
              initial={false}
              animate={{ scaleX: on ? c.advanced / max : 0 }}
              transition={{ duration: 0.7, delay: 0.25 + i * 0.08, ease: EASE_OUT_PREMIUM }}
            />
          </div>
        </div>
      ))}
      <div className="mk-channel-legend">
        <span><i className="mk-channel-key" /> Llegaron</span>
        <span><i className="mk-channel-key mk-channel-key-gold" /> Avanzaron</span>
      </div>
    </div>
  )
}

// ── Idiomas ──────────────────────────────────────────────────────────────────

const LANGS = [
  { code: 'ES', subject: 'Tu valoración está lista' },
  { code: 'EN', subject: 'Your home valuation is ready' },
  { code: 'PT', subject: 'Sua avaliação está pronta' },
]

function LanguagesDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const [i, setI] = useState(0)
  useTicker(live, 2200, () => setI(v => (v + 1) % LANGS.length))
  return (
    <div ref={ref} className="mk-demo mk-langs">
      <div className="mk-langs-codes" role="presentation">
        {LANGS.map((l, k) => (
          <span key={l.code} data-on={k === i || undefined}>
            {l.code}
          </span>
        ))}
      </div>
      <div className="mk-langs-subject">
        <AnimatePresence mode="wait" initial={false}>
          <m.span
            key={LANGS[i].code}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
          >
            {LANGS[i].subject}
          </m.span>
        </AnimatePresence>
      </div>
      <p className="mk-langs-from">Laura Méndez · tu agencia</p>
    </div>
  )
}

// ── Marca ────────────────────────────────────────────────────────────────────

function BrandDemo() {
  return (
    <div className="mk-demo mk-brand">
      <div className="mk-brand-bar">
        <span className="mk-brand-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="mk-brand-url">tuagencia.com/propiedades</span>
      </div>
      <div className="mk-brand-mail">
        <span className="mk-mock-label">De</span>
        <span>Laura Méndez &lt;laura@mail.tuagencia.com&gt;</span>
      </div>
    </div>
  )
}

// ── Estudio (próximamente) ───────────────────────────────────────────────────

function StudioDemo() {
  return (
    <div className="mk-demo mk-studio">
      {['Casa abierta', 'Vendida', 'Nueva en el mercado'].map(label => (
        <span key={label} className="mk-studio-piece">
          <span className="mk-studio-mark">Tu logo</span>
          <span className="mk-studio-label">{label}</span>
        </span>
      ))}
    </div>
  )
}

// ── Plano ────────────────────────────────────────────────────────────────────

const CELLS = [
  {
    key: 'captacion',
    area: 'a',
    title: 'Todo lo que captas, en un solo lugar',
    body: 'Páginas de captura alojadas, guías descargables, eventos y los formularios de tu web. Cada lead entra con su fuente: sin copiar, pegar ni exportar.',
    demo: SourcesDemo,
  },
  {
    key: 'avisos',
    area: 'b',
    title: 'El aviso llega antes que la competencia',
    body: 'Cuando un lead se calienta, el agente que lo atiende lo sabe en segundos, en la aplicación y en Telegram.',
    demo: AlertsDemo,
  },
  {
    key: 'newsletters',
    area: 'c',
    title: 'Una newsletter con tu firma, escrita con IA',
    body: 'La IA investiga tu mercado y redacta la edición; tú la revisas y la publicas. Cada suscriptor entra como lead.',
    demo: NewsletterDemo,
  },
  {
    key: 'open-houses',
    area: 'd',
    title: 'Open houses con confirmación y cuenta regresiva',
    body: 'Anuncio con fotos a los leads que elijas por etiqueta, confirmación con un clic y recordatorio. Quien confirma, sube en tu lista.',
    demo: OpenHouseDemo,
  },
  {
    key: 'propiedades',
    area: 'e',
    title: 'La cargas una vez. Aparece en tu web.',
    body: 'O la arma la IA desde el PDF del listado. Tú decides qué es público y qué queda para el equipo.',
    demo: PropertyDemo,
  },
  {
    key: 'analytics',
    area: 'f',
    title: 'Sabes qué fuente vale la pena',
    body: 'Qué canal trae gente que avanza y cuál sólo trae volumen, con lo que de verdad pasó después.',
    demo: AnalyticsDemo,
  },
  {
    key: 'idiomas',
    area: 'g',
    title: 'En el idioma de cada lead',
    body: 'Español, inglés y portugués, firmado por el agente que lo atiende.',
    demo: LanguagesDemo,
  },
  {
    key: 'marca',
    area: 'h',
    title: 'Tu marca, tu dominio',
    body: 'Logo, colores y dominio tuyos. En ningún lugar donde mire tu cliente dice ITMANO.',
    demo: BrandDemo,
  },
  {
    key: 'estudio',
    area: 'i',
    title: 'Estudio: piezas para redes con tus propiedades',
    body: 'Diseños con tu marca para cada momento de una propiedad, listos para publicar.',
    demo: StudioDemo,
    soon: true,
  },
] as const

export function PlatformPlan() {
  return (
    <div className="mk-plan">
      {CELLS.map(cell => {
        const Demo = cell.demo
        return (
          <article key={cell.key} className="mk-plan-cell" style={{ gridArea: cell.area }}>
            <div className="mk-plan-copy">
              <h3 className="mk-plan-title">
                {cell.title}
                {'soon' in cell && cell.soon && <span className="mk-soon">Próximamente</span>}
              </h3>
              <p className="mk-plan-body">{cell.body}</p>
            </div>
            <Demo />
          </article>
        )
      })}
    </div>
  )
}
