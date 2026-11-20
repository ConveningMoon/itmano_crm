'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, ArrowDown, Check, TriangleAlert } from 'lucide-react'
import { DIM_UI_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import {
  calibratableDimensions, currentOrder, recalibrate,
  type CalibrationRule, type FitEvidence,
} from '@/lib/scoring/calibration'
import { calibrateTenantManually } from '../admin/scoring-actions'

// Ajuste MANUAL del orden de los factores de perfil de un tenant. Es la vía
// secundaria: el cron lo reordena solo cuando hay evidencia de cierres. Sirve
// para dejar un criterio de negocio mientras esa evidencia no existe.
//
// Ordenar, no puntuar: se reparten los MISMOS máximos del modelo global, así
// que el techo del score y las bandas no se mueven. Las penalizaciones no
// cambian — restan por su propio motivo.

function label(d: string): string {
  return DIM_UI_LABEL[d as Dimension] ?? d
}

export function CalibrationPanel({ rules, global, labels, evidence, tenantId }: {
  /** Reglas efectivas del tenant: el orden de partida. */
  rules:    CalibrationRule[]
  /** Reglas globales: los máximos que se reparten. */
  global:   CalibrationRule[]
  /** Nombre de cada opción, por `${dimension}|${matchValue}`. */
  labels:   Record<string, string>
  evidence: FitEvidence
  tenantId: string
}) {
  const router = useRouter()
  const base = currentOrder(rules)
  const [order, setOrder] = useState<string[]>(base)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  const calibrables = calibratableDimensions(global)
  const cambios = recalibrate(global, order)
  const dirty   = order.join() !== base.join()

  // Los máximos que se reparten — el mismo conjunto, en el orden elegido.
  const maximos = calibrables
    .map(d => Math.max(0, ...global.filter(r => r.category === 'fit' && r.dimension === d && r.isActive).map(r => r.points)))
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
      const res = await calibrateTenantManually(tenantId, order)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div>
      {order.map((d, i) => {
        const ev = evidence.dimensions.find(x => x.dimension === d)
        return (
          <div key={d} className="settings-calib-row">
            <span className="settings-calib-pts">{maximos[i]} pts</span>
            <span className="settings-calib-name">{label(d)}</span>
            <span className="settings-calib-spread">
              {evidence.enough && ev?.spread !== null && ev?.spread !== undefined ? `separa ${ev.spread} pp` : '—'}
            </span>
            <span className="settings-calib-moves">
              <button type="button" className="btn btn-ghost" onClick={() => mover(i, -1)} disabled={i === 0 || pending} aria-label={`Subir ${label(d)}`}>
                <ArrowUp size={13} />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => mover(i, 1)} disabled={i === order.length - 1 || pending} aria-label={`Bajar ${label(d)}`}>
                <ArrowDown size={13} />
              </button>
            </span>
          </div>
        )
      })}

      {cambios.length > 0 && dirty && (
        <div className="settings-changes">
          <div className="settings-changes-title">
            {cambios.length} {cambios.length === 1 ? 'punto cambia' : 'puntos cambian'} respecto del modelo global
          </div>
          {cambios.map(c => (
            <div key={`${c.dimension}:${c.matchValue}`} className="settings-change">
              <span className="settings-change-name">{labels[`${c.dimension}|${c.matchValue}`] ?? `${label(c.dimension)} · ${c.matchValue}`}</span>
              <span className="settings-change-delta">
                {c.from} → <strong data-down={c.to > c.from ? undefined : ''}>{c.to}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="settings-alert settings-alert-block settings-alert-wide settings-alert-gap" role="alert">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <div className="settings-inline settings-stack-top" style={{ marginTop: '12px' }}>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={pending || !dirty}>
          {pending ? 'Aplicando y recalculando…' : 'Aplicar a este tenant'}
        </button>
        {dirty && !pending && (
          <button type="button" className="btn btn-ghost" onClick={() => { setOrder(base); setSaved(false); setError(null) }}>
            Restablecer
          </button>
        )}
        {saved && (
          <span className="settings-success" role="status">
            <Check size={14} aria-hidden="true" /> Aplicado: los leads de este tenant ya están recalculados.
          </span>
        )}
      </div>
    </div>
  )
}
