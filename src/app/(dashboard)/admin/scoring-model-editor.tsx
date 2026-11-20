'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Lock, TriangleAlert } from 'lucide-react'
import type { ScoreRule } from '@/lib/data/score-rules'
import { computeScoreReach } from '@/lib/scoring/reach'
import { DIM_UI_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import {
  FIT_DIMENSION_ORDER, FIT_HELP, MODEL_GROUPS, SIDE_EFFECT_LABELS, SIGNAL_HELP, groupOf,
} from '@/lib/scoring/model-catalog'
import { SettingsCard } from '@/components/ui/settings-row'
import { previewScoringChanges, applyScoringChanges, type ImpactRow } from './scoring-actions'

// El modelo global explicado. Por defecto se LEE: qué es cada factor, cuánto
// pesa y si de verdad pasa. Editar es un modo aparte, y antes de aplicar se ve
// el efecto real sobre la cartera de cada tenant (no una doble confirmación
// genérica). Las protecciones no se editan aquí.

type RuleUsage = Record<string, number>

interface DraftEntry { points: string; isActive: boolean }

function key(r: ScoreRule) { return `${r.category}|${r.dimension}|${r.matchValue ?? ''}` }

function parsePoints(raw: string): number | null {
  const s = raw.trim()
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return n >= -100 && n <= 100 ? n : null
}

function fmtPoints(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function usageLabel(n: number | undefined): string {
  if (!n) return 'sin uso en 90 días'
  return `${n} ${n === 1 ? 'lead' : 'leads'} en 90 días`
}

export function ScoringModelEditor({ rules, usage }: { rules: ScoreRule[]; usage: RuleUsage }) {
  const router = useRouter()
  const editables = useMemo(() => rules.filter(r => groupOf(r) !== 'proteccion'), [rules])
  const inicial = useMemo(
    () => Object.fromEntries(editables.map(r => [r.id, { points: String(r.points), isActive: r.isActive }])) as Record<string, DraftEntry>,
    [editables],
  )

  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState<Record<string, DraftEntry>>(inicial)
  const [impact, setImpact]   = useState<ImpactRow[] | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()
  const [applying, startApply]     = useTransition()

  const cambios = editables.filter(r => {
    const d = draft[r.id]
    return d && (d.points !== String(r.points) || d.isActive !== r.isActive)
  })
  const invalido = cambios.some(r => parsePoints(draft[r.id].points) === null)

  // Puntos vigentes en pantalla: el borrador mientras se edita.
  const puntos = (r: ScoreRule) => {
    if (!editing || !draft[r.id]) return r.points
    return parsePoints(draft[r.id].points) ?? r.points
  }
  const activa = (r: ScoreRule) => (editing && draft[r.id] ? draft[r.id].isActive : r.isActive)

  const reach = computeScoreReach(rules.map(r => ({
    category: r.category, dimension: r.dimension, points: puntos(r), isActive: activa(r),
  })))

  function set(id: string, next: DraftEntry) {
    setDraft(prev => ({ ...prev, [id]: next }))
    setImpact(null); setError(null); setDone(null)
  }

  function payload() {
    return cambios.map(r => ({ id: r.id, points: parsePoints(draft[r.id].points)!, isActive: draft[r.id].isActive }))
  }

  function verImpacto() {
    setError(null)
    startPreview(async () => {
      const res = await previewScoringChanges(payload())
      if (!res.ok) { setError(res.error); return }
      setImpact(res.impact)
    })
  }

  function aplicar() {
    setError(null)
    startApply(async () => {
      const res = await applyScoringChanges(payload())
      if (!res.ok) { setError(res.error); return }
      setEditing(false); setImpact(null)
      setDone(res.warning ?? `Modelo actualizado: ${cambios.length} ${cambios.length === 1 ? 'valor' : 'valores'}. Los leads ya están recalculados.`)
      router.refresh()
    })
  }

  function descartar() {
    setDraft(inicial); setEditing(false); setImpact(null); setError(null)
  }

  // ── Perfil: un desplegable por factor ─────────────────────────────────
  const fit = editables.filter(r => groupOf(r) === 'perfil')
  const dims = FIT_DIMENSION_ORDER.filter(d => fit.some(r => r.dimension === d))
  const maxDe = (d: string) => Math.max(0, ...fit.filter(r => r.dimension === d && activa(r)).map(puntos))
  const mayorMax = Math.max(1, ...dims.map(maxDe))

  // Funciones que devuelven JSX, no componentes: un componente declarado dentro
  // del render se remonta en cada tecla y el input pierde el foco.
  function pointsCell(r: ScoreRule) {
    if (!editing) {
      const p = r.points
      return <span className="scoring-points" data-neg={p < 0 ? '' : undefined}>{fmtPoints(p)}</span>
    }
    const d = draft[r.id]
    const bad = parsePoints(d.points) === null
    return (
      <input
        type="text"
        inputMode="numeric"
        className={`settings-input scoring-points-input${bad ? ' settings-input-invalid' : ''}`}
        aria-label={`Puntos de ${r.label ?? r.dimension}`}
        aria-invalid={bad}
        value={d.points}
        disabled={applying}
        onChange={e => set(r.id, { ...d, points: e.target.value })}
      />
    )
  }

  function activeToggle(r: ScoreRule) {
    if (!editing) return null
    const d = draft[r.id]
    return (
      <button
        type="button"
        className="settings-toggle"
        aria-pressed={d.isActive}
        disabled={applying}
        onClick={() => set(r.id, { ...d, isActive: !d.isActive })}
      >
        {d.isActive ? 'Activa' : 'Inactiva'}
      </button>
    )
  }

  const grupo = (k: string) => MODEL_GROUPS.find(g => g.key === k)!

  return (
    <SettingsCard
      title="Modelo de scoring"
      hint="Es el mismo para todos los tenants. Lo que cambia por mercado es el orden de los factores de perfil, que se calibra solo con los cierres de cada tenant."
      action={editing ? (
        <button type="button" className="btn btn-ghost" onClick={descartar} disabled={applying}>Descartar</button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => { setEditing(true); setDone(null) }}>Editar puntos</button>
      )}
    >
      <div className="settings-stack">
        <div className="scoring-reach">
          <span>El mejor lead posible llega a <strong>{reach.reachable}</strong> de 100</span>
          <span>Perfil hasta <strong>{reach.bestFit}</strong></span>
          <span>Actividad hasta <strong>{reach.engagement}</strong></span>
          <span>Acciones del agente hasta <strong>{reach.manual}</strong></span>
        </div>
        {reach.warnings.map(w => (
          <div key={w.code} className="settings-alert settings-alert-block settings-alert-wide" role="alert">
            <TriangleAlert size={14} aria-hidden="true" />
            <span>{w.message}</span>
          </div>
        ))}

        <div>
          {/* Quién es */}
          <section className="scoring-group" aria-labelledby="scoring-g-perfil">
            <h4 className="scoring-group-title" id="scoring-g-perfil">{grupo('perfil').title}</h4>
            <p className="scoring-group-summary">{grupo('perfil').summary}</p>
            {dims.map(d => {
              const opciones = fit.filter(r => r.dimension === d).sort((a, b) => b.points - a.points)
              const max = maxDe(d)
              const usos = opciones.reduce((s, r) => s + (usage[key(r)] ?? 0), 0)
              return (
                <details key={d} className="scoring-factor" open={editing || undefined}>
                  <summary>
                    <ChevronRight size={14} className="scoring-chevron" aria-hidden="true" />
                    <div className="scoring-factor-main">
                      <div className="scoring-factor-name">{DIM_UI_LABEL[d as Dimension] ?? d}</div>
                      <div className="scoring-factor-help">{FIT_HELP[d as Dimension]}</div>
                    </div>
                    <span className="scoring-usage" data-none={usos ? undefined : ''}>{usageLabel(usos)}</span>
                    <span className="scoring-weight" aria-hidden="true"><span style={{ width: `${(max / mayorMax) * 100}%` }} /></span>
                    <span className="scoring-factor-max">{max > 0 ? `hasta +${max}` : 'no suma'}</span>
                  </summary>
                  <div className="scoring-options">
                    {opciones.map(r => (
                      <div key={r.id} className="scoring-option">
                        <span className="scoring-option-name">{r.label ?? r.matchValue}</span>
                        <span className="scoring-usage" data-none={usage[key(r)] ? undefined : ''}>{usageLabel(usage[key(r)])}</span>
                        {pointsCell(r)}
                      </div>
                    ))}
                  </div>
                </details>
              )
            })}
          </section>

          {/* Qué hace / Qué registra el agente */}
          {(['actividad', 'agente'] as const).map(g => {
            const senales = editables.filter(r => groupOf(r) === g).sort((a, b) => b.points - a.points)
            return (
              <section key={g} className="scoring-group" aria-labelledby={`scoring-g-${g}`}>
                <h4 className="scoring-group-title" id={`scoring-g-${g}`}>{grupo(g).title}</h4>
                <p className="scoring-group-summary">{grupo(g).summary}</p>
                {senales.map(r => (
                  <div key={r.id} className="scoring-signal" data-inactive={activa(r) ? undefined : ''}>
                    <div className="scoring-option-name">
                      <div>{r.label ?? r.dimension}</div>
                      {SIGNAL_HELP[r.dimension] && <div className="scoring-factor-help">{SIGNAL_HELP[r.dimension]}</div>}
                    </div>
                    <span className="scoring-usage" data-none={usage[key(r)] ? undefined : ''}>{usageLabel(usage[key(r)])}</span>
                    {pointsCell(r)}
                    {activeToggle(r)}
                  </div>
                ))}
              </section>
            )
          })}

          {/* Protecciones */}
          <section className="scoring-group" aria-labelledby="scoring-g-proteccion">
            <h4 className="scoring-group-title" id="scoring-g-proteccion">{grupo('proteccion').title}</h4>
            <p className="scoring-group-summary">{grupo('proteccion').summary}</p>
            {rules.filter(r => groupOf(r) === 'proteccion').sort((a, b) => a.points - b.points).map(r => (
              <div key={r.id} className="scoring-signal">
                <Lock size={13} className="scoring-lock" aria-hidden="true" />
                <div className="scoring-option-name">
                  <div>{r.label ?? r.dimension}</div>
                  <div className="scoring-factor-help">{SIGNAL_HELP[r.dimension] ?? ''}</div>
                </div>
                <span className="scoring-effect">{SIDE_EFFECT_LABELS[r.sideEffect ?? ''] ?? r.sideEffect}</span>
                <span className="scoring-usage" data-none={usage[key(r)] ? undefined : ''}>{usageLabel(usage[key(r)])}</span>
                <span className="scoring-points" data-neg={r.points < 0 ? '' : undefined}>{fmtPoints(r.points)}</span>
              </div>
            ))}
          </section>
        </div>

        {done && (
          <span className="settings-success" role="status"><Check size={14} aria-hidden="true" /> {done}</span>
        )}

        {editing && (
          <>
            {impact && (
              <div className="settings-panel settings-panel-gold">
                <p className="settings-confirm-text">
                  Esto cambia <strong>{cambios.length}</strong> {cambios.length === 1 ? 'valor' : 'valores'} del modelo de
                  <strong> todos los tenants</strong>. Así quedaría su cartera activa:
                </p>
                <div className="scoring-impact-wrap">
                  <table className="scoring-impact">
                    <thead>
                      <tr>
                        <th scope="col">Tenant</th>
                        <th scope="col">Leads activos</th>
                        <th scope="col">Cambian de puntaje</th>
                        <th scope="col">Cambian de banda</th>
                        <th scope="col">Calidad alta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.map(i => (
                        <tr key={i.tenantId}>
                          <td>
                            {i.tenantName}
                            {i.degenerateAfter && !i.degenerateBefore && (
                              <div className="scoring-effect">La calidad dejaría de distinguir entre leads</div>
                            )}
                          </td>
                          <td>{i.activeLeads}</td>
                          <td>{i.scoreChanged}</td>
                          <td>{i.bandChanged}</td>
                          <td>{i.altaBefore} → <strong>{i.altaAfter}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="settings-note">Al aplicar, todos los leads se recalculan en el acto, sin avisos de &ldquo;lead caliente&rdquo;.</p>
              </div>
            )}

            <div className="settings-footer">
              {error && <span className="settings-footer-msg settings-footer-msg-error" role="alert">{error}</span>}
              {!error && cambios.length === 0 && <span className="settings-footer-msg">Cambia un valor para ver su impacto.</span>}
              {impact ? (
                <button type="button" className="btn btn-primary" onClick={aplicar} disabled={applying || invalido}>
                  {applying ? 'Aplicando y recalculando…' : 'Aplicar a todos los tenants'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={verImpacto}
                  disabled={previewing || invalido || cambios.length === 0}>
                  {previewing ? 'Calculando impacto…' : 'Ver impacto'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </SettingsCard>
  )
}
