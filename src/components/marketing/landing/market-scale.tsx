'use client'

import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

// "Tu vara, no una importada": el mismo presupuesto cae en una banda distinta
// según el mercado. El visitante cambia de mercado y ve moverse al lead sobre
// la regla. Los rangos son ilustrativos —se dice en pantalla—; en el CRM cada
// cliente define los suyos en su perfil de negocio.

const BUDGET = 450_000
const BANDS = ['Bajo', 'Medio', 'Alto', 'Premium'] as const

const MARKETS = [
  { key: 'virginia', label: 'Virginia', edges: [0, 250_000, 400_000, 650_000, 1_200_000] },
  { key: 'madrid', label: 'Madrid', edges: [0, 300_000, 600_000, 1_100_000, 2_500_000] },
  { key: 'cdmx', label: 'Ciudad de México', edges: [0, 120_000, 250_000, 420_000, 900_000] },
] as const

function place(edges: readonly number[], value: number) {
  const upper = edges.findIndex((e, i) => i > 0 && value < e)
  const band = upper === -1 ? BANDS.length - 1 : Math.max(0, upper - 1)
  const lo = edges[band]
  const hi = edges[band + 1]
  const within = Math.max(0, Math.min(1, (value - lo) / (hi - lo)))
  return { band, pct: ((band + within) / BANDS.length) * 100 }
}

const money = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString('en-US')}M` : `${n / 1000}k`)

export function MarketScale() {
  const [key, setKey] = useState<(typeof MARKETS)[number]['key']>('virginia')
  const market = MARKETS.find(mk => mk.key === key) ?? MARKETS[0]
  const { band, pct } = place(market.edges, BUDGET)

  return (
    <div className="mk-market">
      <div className="mk-market-head">
        <div>
          <p className="mk-market-label">Presupuesto del lead</p>
          <p className="mk-market-budget mk-num">US$ 450,000</p>
        </div>
        <div className="mk-market-switch" role="group" aria-label="Mercado">
          {MARKETS.map(mk => (
            <button
              key={mk.key}
              type="button"
              aria-pressed={mk.key === key}
              onClick={() => setKey(mk.key)}
              className="mk-market-option"
            >
              {mk.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mk-market-scale">
        <div className="mk-market-bands" aria-hidden>
          {BANDS.map((b, i) => (
            <span key={b} className="mk-market-band" data-on={i === band || undefined}>
              {b}
            </span>
          ))}
        </div>
        <div className="mk-market-track" aria-hidden>
          <m.span
            className="mk-market-runner"
            initial={false}
            animate={{ x: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          >
            <span className="mk-market-light" />
          </m.span>
        </div>
        <div className="mk-market-edges mk-num" aria-hidden>
          {market.edges.slice(1, -1).map((e, i) => (
            <span key={`${market.key}-${e}`} style={{ left: `${((i + 1) / BANDS.length) * 100}%` }}>
              {money(e)}
            </span>
          ))}
        </div>
      </div>

      <p className="mk-market-verdict" aria-live="polite">
        En {market.label}, este lead es{' '}
        <AnimatePresence mode="wait" initial={false}>
          <m.strong
            key={`${market.key}-${band}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE_OUT_PREMIUM }}
          >
            {BANDS[band].toLowerCase()}
          </m.strong>
        </AnimatePresence>
        .
      </p>
      <p className="mk-demo-note" style={{ textAlign: 'left' }}>Rangos ilustrativos</p>
    </div>
  )
}
