import { CHART_TEXT, GOLD_RAMP, STAGE_HEX } from '@/lib/charts/palette'
import type { Stage } from '@/lib/scoring/priority'

// Embudo en cápsulas, SVG de servidor (sin JS en el cliente). Cada cápsula crece
// con su conteo sobre un carril tenue; Perdido va rayado porque es una salida del
// embudo, no un escalón. Los ids de <defs> son fijos: una sola vez por página.
const W = 340
const H = 230
const TOP = 26
const BOTTOM = 26
const GAP = 14

export function CapsuleFunnel({ stages }: {
  stages: { key: Stage; label: string; count: number }[]
}) {
  const n = Math.max(stages.length, 1)
  const barW = (W - GAP * (n - 1)) / n
  const lane = H - TOP - BOTTOM
  const max = Math.max(1, ...stages.map(s => s.count))
  // La cápsula con más leads lleva el brillo.
  const peak = stages.findIndex(s => s.count === max && max > 0)
  const summary = `Embudo: ${stages.map(s => `${s.label} ${s.count}`).join(', ')}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="capsule-funnel" role="img" aria-label={summary}>
      <defs>
        <pattern id="cf-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--bg-overlay)" />
          <rect width="2" height="6" fill={GOLD_RAMP[4]} />
        </pattern>
        <linearGradient id="cf-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.22} />
          <stop offset="1" stopColor="#000" stopOpacity={0.18} />
        </linearGradient>
      </defs>
      {stages.map((s, i) => {
        const x = i * (barW + GAP)
        const h = s.count > 0 ? Math.max(10, (s.count / max) * lane) : 0
        const y = H - BOTTOM - h
        const r = Math.min(barW / 2, h / 2)
        const lost = s.key === 'perdido'
        return (
          <g key={s.key}>
            <title>{`${s.label}: ${s.count.toLocaleString('en-US')}`}</title>
            <rect x={x} y={TOP} width={barW} height={lane} rx={barW / 2} fill="rgba(255,255,255,0.025)" />
            {h > 0 && (
              <>
                <rect
                  x={x} y={y} width={barW} height={h} rx={r}
                  fill={lost ? 'url(#cf-hatch)' : STAGE_HEX[s.key]}
                  style={i === peak ? { filter: 'drop-shadow(0 0 9px rgba(221,185,104,0.5))' } : undefined}
                />
                {!lost && <rect x={x} y={y} width={barW} height={h} rx={r} fill="url(#cf-shade)" />}
              </>
            )}
            <text
              x={x + barW / 2} y={(h > 0 ? y : H - BOTTOM) - 7}
              textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--text-primary)"
            >
              {s.count.toLocaleString('en-US')}
            </text>
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9.5} fill={CHART_TEXT.muted}>
              {s.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
