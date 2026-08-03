'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, ArrowDown, Check } from 'lucide-react'
import { DIM_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import {
  calibratableDimensions, currentOrder, recalibrate,
  MIN_CLOSES_FOR_EVIDENCE, type CalibrationRule, type FitEvidence,
} from '@/lib/scoring/calibration'
import { applyFitCalibration } from './actions'

// Ordenar, no puntuar. Nadie sabe contestar "¿cuántos puntos vale la
// preaprobación?", pero el dueño de una agencia sí sabe qué le importa más.
//
// La segunda columna es la que debe ganar con el tiempo: mide cuánto separa cada
// factor a los leads que cerraron de los que no. Mientras no haya cierres
// suficientes lo dice en vez de mostrar un número que no significa nada.

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
  marginBottom: '16px',
}
const HEAD: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }
const HINT: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }
const BTN_GHOST: React.CSSProperties = {
  padding: '4px 6px', fontSize: '12px', color: 'var(--text-muted)',
  background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: '6px', cursor: 'pointer', lineHeight: 0,
}

function label(d: string): string {
  return DIM_LABEL[d as Dimension] ?? d
}

export function CalibrationPanel({ rules, evidence, tenantId }: {
  rules:    CalibrationRule[]
  evidence: FitEvidence
  tenantId: string
}) {
  const base = currentOrder(rules)
  const [order, setOrder] = useState<string[]>(base)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const calibrables = calibratableDimensions(rules)
  const cambios = recalibrate(rules, order)
  const dirty   = order.join() !== base.join()

  // Los máximos que se reparten — el mismo conjunto, en el orden elegido.
  const maximos = calibrables
    .map(d => Math.max(0, ...rules.filter(r => r.category === 'fit' && r.dimension === d && r.isActive).map(r => r.points)))
    .sort((a, b) => b - a)

  function mover(i: number, delta: number) {
    const j = i + delta
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next); setSaved(false); setError(null)
  }

  function guardar() {
    setError(null)
    start(async () => {
      const res = await applyFitCalibration(tenantId, order)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
    })
  }

  return (
    <div style={CARD}>
      <div style={HEAD}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Calibración por mercado
        </span>
        <div style={HINT}>
          Qué predice mejor un cierre en ESTE mercado. Se reparten los mismos máximos que
          ya tiene el modelo, sólo que en otro orden: el techo del score no se mueve y las
          bandas de calidad quedan intactas. Las penalizaciones no cambian — restan por su
          propio motivo, no por el peso de su factor.
        </div>
      </div>

      <div style={{ padding: '8px 20px 16px' }}>
        {order.map((d, i) => {
          const ev = evidence.dimensions.find(x => x.dimension === d)
          return (
            <div
              key={d}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--accent-gold)',
                minWidth: '34px', textAlign: 'right',
              }}>
                {maximos[i]} pts
              </span>
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', minWidth: 0 }}>
                {label(d)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {evidence.enough && ev?.spread !== null && ev?.spread !== undefined
                  ? `separa ${ev.spread} pp`
                  : '—'}
              </span>
              <span style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ ...BTN_GHOST, opacity: i === 0 ? 0.35 : 1 }} aria-label={`Subir ${label(d)}`}>
                  <ArrowUp size={13} />
                </button>
                <button onClick={() => mover(i, 1)} disabled={i === order.length - 1} style={{ ...BTN_GHOST, opacity: i === order.length - 1 ? 0.35 : 1 }} aria-label={`Bajar ${label(d)}`}>
                  <ArrowDown size={13} />
                </button>
              </span>
            </div>
          )
        })}

        <div style={{ ...HINT, marginTop: '12px' }}>
          {evidence.enough ? (
            <>La columna del medio mide cuánto separa cada factor a los leads que cerraron
              de los que no, sobre {evidence.closedWithFit} cierres con perfil. Lo que más
              separa debería estar arriba.</>
          ) : (
            <>Todavía no hay evidencia: {evidence.closedWithFit} de {MIN_CLOSES_FOR_EVIDENCE} cierres
              con perfil declarado ({evidence.withFit} leads con perfil en total). Hasta llegar
              ahí, el orden es un criterio de negocio — no un dato.</>
          )}
        </div>

        {cambios.length > 0 && (
          <div style={{
            marginTop: '14px', padding: '12px', borderRadius: '8px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {cambios.length} {cambios.length === 1 ? 'punto cambia' : 'puntos cambian'}
            </div>
            {cambios.map(c => (
              <div key={`${c.dimension}:${c.matchValue}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{c.dimension} · {c.matchValue}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {c.from} → <strong style={{ color: c.to > c.from ? 'var(--accent-green)' : 'var(--accent-coral)' }}>{c.to}</strong>
                </span>
              </div>
            ))}
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: '#E04040', marginTop: '10px' }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
          <button
            onClick={guardar}
            disabled={pending || !dirty}
            style={{
              padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              fontSize: '13px', fontWeight: 500,
              cursor: (pending || !dirty) ? 'default' : 'pointer',
              opacity: (pending || !dirty) ? 0.5 : 1,
            }}
          >
            {pending ? 'Aplicando…' : 'Aplicar a este tenant'}
          </button>
          {dirty && (
            <button onClick={() => { setOrder(base); setSaved(false); setError(null) }} style={{ ...BTN_GHOST, lineHeight: 1.4, padding: '7px 14px' }}>
              Restablecer
            </button>
          )}
          {saved && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--accent-green)' }}>
              <Check size={14} /> Aplicado. Se nota en el próximo recálculo de cada lead.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
