'use client'

import { useState } from 'react'
import { planeCuts, samePoint, topThree, type PlanePoint } from '@/lib/dashboard/source-plane'

// Plano "cantidad vs. score": un punto por fuente, sin etiquetas. Los nombres viven
// en una columna al lado; tocar un punto o un nombre enciende ambos y volver a
// tocarlo los apaga. Pueden estar varios encendidos a la vez.

const W = 340, H = 262, L = 38, R = 14, T = 16, B = 38
const HIT_R = 14 // radio del área de toque: 28 unidades, más de 24 px al escalar el SVG

const STEPS = [1, 2, 3, 4, 5, 6, 8, 10]

/** Máximo del eje X: múltiplo de 3 con un poco de aire para que el punto mayor no toque el borde. */
function axisMax(maxLeads: number): number {
  const need = (maxLeads * 1.08) / 3
  const mag = 10 ** Math.floor(Math.log10(Math.max(need, 1)))
  const step = STEPS.map(s => s * mag).find(s => s >= need) ?? 10 * mag
  return Math.max(3, step * 3)
}

export function SourcePlane({ points }: { points: PlanePoint[] }) {
  const [lit, setLit] = useState<ReadonlySet<string>>(new Set())

  const top = topThree(points)
  const cuts = planeCuts(points)
  const xMax = axisMax(points.reduce((m, p) => Math.max(m, p.leads), 0))
  const x = (v: number) => L + (v / xMax) * (W - L - R)
  const y = (v: number) => T + (1 - v / 100) * (H - T - B)

  const toggle = (id: string) => {
    const ids = samePoint(points, id)
    setLit(prev => {
      const on = !prev.has(id)
      const next = new Set(prev)
      for (const i of ids) { if (on) next.add(i); else next.delete(i) }
      return next
    })
  }
  const onKey = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id) }
  }

  const rank = (id: string) => top.indexOf(id)
  const label = (p: PlanePoint) => `${p.name}: ${p.leads} leads, score ${Math.round(p.score)}`
  const topPoints = top.map(id => points.find(p => p.id === id)).filter((p): p is PlanePoint => !!p)
  const others = points.filter(p => !top.includes(p.id)).sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name))

  const cutX = x(cuts.leads), cutY = y(cuts.score)
  const ticksX = [0, 1, 2, 3].map(i => Math.round((xMax * i) / 3))

  const nameBtn = (p: PlanePoint) => {
    const r = rank(p.id)
    return (
      <button key={p.id} type="button" className="sp-name" aria-pressed={lit.has(p.id)} onClick={() => toggle(p.id)}>
        <i className="sp-mark">{r >= 0 ? r + 1 : ''}</i>
        <span>{p.name}</span>
        <small>{p.leads} · {Math.round(p.score)}</small>
      </button>
    )
  }

  return (
    <div className="sp-wrap">
      <div className="sp-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Leads y score medio por fuente" className="sp-svg">
          <rect x={cutX} y={y(100)} width={Math.max(0, x(xMax) - cutX)} height={Math.max(0, cutY - y(100))} className="sp-zone" />
          <line x1={cutX} x2={cutX} y1={y(100)} y2={y(0)} className="sp-cut" />
          <line x1={L} x2={W - R} y1={cutY} y2={cutY} className="sp-cut" />
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="sp-base" />
          {[0, 50, 100].map(v => (
            <text key={v} x={L - 6} y={y(v) + 3} textAnchor="end" className="sp-tick">{v}</text>
          ))}
          {ticksX.map(v => (
            <text key={v} x={x(v)} y={H - 24} textAnchor="middle" className="sp-tick">{v}</text>
          ))}
          <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="sp-axis">Cantidad de leads captados →</text>
          <text transform={`translate(11 ${(y(0) + y(100)) / 2}) rotate(-90)`} textAnchor="middle" className="sp-axis">Score medio de sus leads →</text>
          <text x={W - R - 5} y={y(100) + 12} textAnchor="end" className="sp-zone-name" data-best>Muchos y buenos</text>
          <text x={L + 5} y={y(100) + 12} className="sp-zone-name">Pocos pero buenos</text>
          <text x={W - R - 5} y={y(0) - 6} textAnchor="end" className="sp-zone-name">Muchos, score bajo</text>
          <text x={L + 5} y={y(0) - 6} className="sp-zone-name">Pocos, score bajo</text>
          {points.map(p => {
            const r = rank(p.id)
            return (
              <g
                key={p.id} className="sp-pt" role="button" tabIndex={0}
                aria-pressed={lit.has(p.id)} aria-label={label(p)}
                onClick={() => toggle(p.id)} onKeyDown={onKey(p.id)}
              >
                <circle cx={x(p.leads)} cy={y(p.score)} r={HIT_R} fill="transparent" />
                <circle cx={x(p.leads)} cy={y(p.score)} r={r >= 0 ? 8 : 5.5} className="sp-dot" data-top={r >= 0 || undefined} />
                {r >= 0 && (
                  <text x={x(p.leads)} y={y(p.score) + 3.2} textAnchor="middle" className="sp-rank">{r + 1}</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="sp-list" tabIndex={0} role="group" aria-label="Fuentes del plano">
        <div className="sp-group">Top 3</div>
        {topPoints.map(nameBtn)}
        {others.length > 0 && <div className="sp-group">Otras</div>}
        {others.map(nameBtn)}
        <div className="sp-legend">Leads · score</div>
      </div>
    </div>
  )
}
