'use client'

import { useState } from 'react'
import { AnimatePresence, LayoutGroup, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { QUALITY_BANDS, QUALITY_CONFIG, type QualityBand } from '@/lib/scoring/priority'
import { Avatar, QualityChip } from './crm-bits'
import type { DemoTone } from './demo-data'

// "La vara de tu mercado": los mismos seis leads, calificados con los rangos de
// tres mercados distintos. Cambia el mercado y cambian sus bandas y la
// distribución, que se dibuja como el gráfico de Analytics del producto. Es
// ilustrativo —aquí sólo cuenta el presupuesto— y la pantalla lo dice.

const MARKETS = [
  { key: 'virginia', label: 'Virginia', edges: [200_000, 300_000, 400_000, 550_000] },
  { key: 'madrid', label: 'Madrid', edges: [300_000, 500_000, 750_000, 1_100_000] },
  { key: 'cdmx', label: 'Ciudad de México', edges: [120_000, 200_000, 320_000, 480_000] },
] as const

type MarketKey = (typeof MARKETS)[number]['key']

const PEOPLE: { name: string; budget: number; tone: DemoTone }[] = [
  { name: 'Mariana González', budget: 450_000, tone: 'gold' },
  { name: 'Diego Ramos', budget: 780_000, tone: 'green' },
  { name: 'Camila Soto', budget: 540_000, tone: 'blue' },
  { name: 'Jorge Lira', budget: 320_000, tone: 'coral' },
  { name: 'Ricardo Vega', budget: 260_000, tone: 'teal' },
  { name: 'Lucía Ferrer', budget: 210_000, tone: 'pink' },
]

// QUALITY_BANDS va de mejor a peor; los cortes, de menor a mayor presupuesto.
function bandFor(budget: number, edges: readonly number[]): QualityBand {
  const above = edges.filter(e => budget >= e).length
  return QUALITY_BANDS[QUALITY_BANDS.length - 1 - above]
}

const money = (n: number) => `US$ ${(n / 1000).toLocaleString('en-US')}k`

export function QualityMarket() {
  const [key, setKey] = useState<MarketKey>('virginia')
  const market = MARKETS.find(mk => mk.key === key) ?? MARKETS[0]
  const rated = PEOPLE.map(p => ({ ...p, band: bandFor(p.budget, market.edges) }))
  const counts = QUALITY_BANDS.map(b => rated.filter(r => r.band === b).length)
  const max = Math.max(...counts, 1)

  return (
    <div className="qm">
      <div className="qm-switch" role="group" aria-label="Mercado">
        {MARKETS.map(mk => (
          <button key={mk.key} type="button" aria-pressed={mk.key === key} onClick={() => setKey(mk.key)}>
            {mk.label}
          </button>
        ))}
      </div>

      <div className="qm-grid">
        <section className="crm-card qm-list">
          <p className="crm-card-title">Tus leads en {market.label}</p>
          <LayoutGroup id="qm">
            <ol>
              {[...rated]
                .sort((a, b) => QUALITY_BANDS.indexOf(a.band) - QUALITY_BANDS.indexOf(b.band) || b.budget - a.budget)
                .map(p => (
                  <m.li key={p.name} layout transition={{ duration: 0.5, ease: EASE_OUT_PREMIUM }} className="qm-row">
                    <Avatar name={p.name} tone={p.tone} size={28} />
                    <span className="crm-who">
                      <span className="crm-who-name">{p.name}</span>
                      <span className="crm-who-sub">Presupuesto {money(p.budget)}</span>
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      <m.span
                        key={p.band}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                      >
                        <QualityChip band={p.band} />
                      </m.span>
                    </AnimatePresence>
                  </m.li>
                ))}
            </ol>
          </LayoutGroup>
        </section>

        <section className="crm-card qm-chart">
          <p className="crm-card-title">Distribución de calidad</p>
          <p className="crm-card-sub">Cómo se reparte tu cartera entre las cinco bandas</p>
          <div className="qm-bars">
            {QUALITY_BANDS.map((b, i) => (
              <div key={b} className="qm-bar-row">
                <span>{QUALITY_CONFIG[b].label}</span>
                <span className="qm-track">
                  <m.span
                    className="qm-fill"
                    style={{ backgroundColor: QUALITY_CONFIG[b].color }}
                    initial={false}
                    animate={{ scaleX: counts[i] / max }}
                    transition={{ duration: 0.6, ease: EASE_OUT_PREMIUM }}
                  />
                </span>
                <span className="qm-n">{counts[i]}</span>
              </div>
            ))}
          </div>
          <p className="qm-note">
            Ejemplo ilustrativo: aquí sólo cuenta el presupuesto. En el CRM pesan también la urgencia, la financiación y lo que el lead hace después.
          </p>
        </section>
      </div>
    </div>
  )
}
