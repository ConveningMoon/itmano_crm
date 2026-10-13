'use client'

import { useRef, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { Bell, CornerDownLeft, UserPlus } from 'lucide-react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { useArrived, useLive, useTicker } from './crm-bits'

// "Y además": el resto de la plataforma en una grilla de celdas de distinto
// tamaño, cada una con una muestra del producto haciendo su trabajo. Las
// muestras que se mueven sólo corren mientras están en pantalla. Datos
// ficticios, igual que el resto de la landing.

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

// ── Grilla ───────────────────────────────────────────────────────────────────

const CELLS = [
  {
    key: 'captacion',
    area: 'a',
    title: 'Todo lo que captas, en un solo lugar',
    body: 'Páginas de captura alojadas, guías, eventos, los formularios de tu web e importación desde planilla. Cada lead entra con su fuente.',
    demo: SourcesDemo,
  },
  {
    key: 'avisos',
    area: 'b',
    title: 'El aviso llega antes que la competencia',
    body: 'Cuando un lead se calienta o responde, su agente lo sabe en segundos, en la aplicación y en Telegram.',
    demo: AlertsDemo,
  },
  {
    key: 'analytics',
    area: 'c',
    title: 'Sabes qué fuente vale la pena',
    body: 'Qué canal trae gente que avanza y cuál sólo trae volumen.',
    demo: AnalyticsDemo,
  },
  {
    key: 'marca',
    area: 'd',
    title: 'Tu marca, tu dominio',
    body: 'En ningún lugar donde mire tu cliente dice ITMANO.',
    demo: BrandDemo,
  },
  {
    key: 'estudio',
    area: 'e',
    title: 'Estudio: piezas para redes',
    body: 'Diseños con tu marca para cada momento de una propiedad.',
    demo: StudioDemo,
    soon: true,
  },
] as const

export function MoreGrid() {
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
