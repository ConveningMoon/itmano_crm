import { GOLD_RAMP } from '@/lib/charts/palette'

const R = 31
const CIRCUMFERENCE = 2 * Math.PI * R

// Anillo de 0 a 100 (calidad media de un agente, por ejemplo). Server Component:
// SVG sin estado. El valor se acota para que un dato fuera de rango no rompa el trazo.
export function RingGauge({ value, label }: { value: number; label: string }) {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
  const shown = Math.round(v)

  return (
    <div className="ring-gauge">
      <svg viewBox="0 0 82 82" role="img" aria-label={`${label}: ${shown}`}>
        <circle cx="41" cy="41" r={R} fill="none" stroke="var(--bg-overlay)" strokeWidth={8} />
        {v > 0 && (
          <circle
            cx="41" cy="41" r={R} fill="none" stroke={GOLD_RAMP[1]} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={`${(v / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            transform="rotate(-90 41 41)"
            style={{ filter: 'drop-shadow(0 0 5px rgba(221,185,104,0.4))' }}
          />
        )}
        <text x="41" y="46" textAnchor="middle" fontSize={16} fontWeight={600} fill="var(--text-primary)">
          {shown}
        </text>
      </svg>
      <span>{label}</span>
    </div>
  )
}
