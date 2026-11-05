'use client'

import { useState, useTransition } from 'react'
import { ArrowUp, ArrowDown, Check, TriangleAlert } from 'lucide-react'
import { DIM_UI_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import {
  calibratableDimensions, currentOrder, recalibrate,
  MIN_CLOSES_FOR_EVIDENCE, type CalibrationRule, type FitEvidence,
} from '@/lib/scoring/calibration'
import { InfoHint } from '@/components/ui/info-hint'
import { SettingsCard } from '@/components/ui/settings-row'
import { applyFitCalibration } from './actions'

// Ordenar, no puntuar. Nadie sabe contestar "¿cuántos puntos vale la
// preaprobación?", pero el dueño de una agencia sí sabe qué le importa más.
//
// La segunda columna es la que debe ganar con el tiempo: mide cuánto separa cada
// factor a los leads que cerraron de los que no. Mientras no haya cierres
// suficientes lo dice en vez de mostrar un número que no significa nada.

function label(d: string): string {
  return DIM_UI_LABEL[d as Dimension] ?? d
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
    <SettingsCard
      title="Calibración por mercado"
      action={(
        <InfoHint label="Cómo funciona la calibración">
          Qué predice mejor un cierre en ESTE mercado. Se reparten los mismos máximos que
          ya tiene el modelo, sólo que en otro orden: el techo del score no se mueve y las
          bandas de calidad quedan intactas. Las penalizaciones no cambian — restan por su
          propio motivo, no por el peso de su factor.
        </InfoHint>
      )}
    >
      <div>
        {order.map((d, i) => {
          const ev = evidence.dimensions.find(x => x.dimension === d)
          return (
            <div key={d} className="settings-calib-row">
              <span className="settings-calib-pts">{maximos[i]} pts</span>
              <span className="settings-calib-name">{label(d)}</span>
              <span className="settings-calib-spread">
                {evidence.enough && ev?.spread !== null && ev?.spread !== undefined
                  ? `separa ${ev.spread} pp`
                  : '—'}
              </span>
              <span className="settings-calib-moves">
                <button type="button" className="btn btn-ghost" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${label(d)}`}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => mover(i, 1)} disabled={i === order.length - 1} aria-label={`Bajar ${label(d)}`}>
                  <ArrowDown size={13} />
                </button>
              </span>
            </div>
          )
        })}

        {/* Dice cuánto fiarse de la columna "separa": se queda visible. */}
        <p className="settings-note settings-note-gap">
          {evidence.enough ? (
            <>La columna del medio mide cuánto separa cada factor a los leads que cerraron
              de los que no, sobre {evidence.closedWithFit} cierres con perfil. Lo que más
              separa debería estar arriba.</>
          ) : (
            <>Todavía no hay evidencia: {evidence.closedWithFit} de {MIN_CLOSES_FOR_EVIDENCE} cierres
              con perfil declarado ({evidence.withFit} {evidence.withFit === 1 ? 'lead' : 'leads'} con
              perfil en total). Hasta llegar
              ahí, el orden es un criterio de negocio — no un dato.</>
          )}
        </p>

        {cambios.length > 0 && (
          <div className="settings-changes">
            <div className="settings-changes-title">
              {cambios.length} {cambios.length === 1 ? 'punto cambia' : 'puntos cambian'}
            </div>
            {cambios.map(c => (
              <div key={`${c.dimension}:${c.matchValue}`} className="settings-change">
                <span className="settings-change-name">{c.dimension} · {c.matchValue}</span>
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

        <div className="settings-inline settings-stack-top">
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={pending || !dirty}>
            {pending ? 'Aplicando…' : 'Aplicar a este tenant'}
          </button>
          {dirty && (
            <button type="button" className="btn btn-ghost" onClick={() => { setOrder(base); setSaved(false); setError(null) }}>
              Restablecer
            </button>
          )}
          {saved && (
            <span className="settings-success">
              <Check size={14} /> Aplicado. Se nota en el próximo recálculo de cada lead.
            </span>
          )}
        </div>
      </div>
    </SettingsCard>
  )
}
