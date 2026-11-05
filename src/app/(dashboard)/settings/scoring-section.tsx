'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ScoreRule } from '@/lib/data/score-rules'
import { computeScoreReach, type ReachRule } from '@/lib/scoring/reach'
import { QUALITY_CUTS } from '@/lib/scoring/score-bands'
import { QUALITY_CONFIG } from '@/lib/scoring/priority'
import { TriangleAlert } from 'lucide-react'
import { InfoHint } from '@/components/ui/info-hint'
import { SettingsCard } from '@/components/ui/settings-row'
import { updateScoreRules } from './actions'

// ─── Vocabulary labels (display only — never editable) ──────────────────────────

const FIT_DIMENSION_ORDER = [
  'timeline', 'financing', 'budget_tier', 'agent_status', 'contingency', 'geo_fit',
  'property_use', 'sell_motivation', 'listing_status',
]

const DIMENSION_LABELS: Record<string, string> = {
  timeline:        'Horizonte de compra',
  financing:       'Financiamiento',
  budget_tier:     'Presupuesto',
  agent_status:    'Relación con agente',
  sell_motivation: 'Motivación de venta',
  listing_status:  'Estado del listado',
  contingency:     'Contingencia de venta',
  geo_fit:         'Encaje de zona',
  property_use:    'Uso de la propiedad',
}

const SIDE_EFFECT_LABELS: Record<string, string> = {
  block_email:        'bloquea el canal de email',
  mark_email_invalid: 'marca el email como inválido',
  force_perdido:      'fuerza estado perdido',
  pause_sequences:    'pausa las secuencias',
}

// ─── Local draft state ──────────────────────────────────────────────────────────

interface DraftEntry { points: string; isActive: boolean }
type DraftMap = Record<string, DraftEntry>

function buildDraft(rules: ScoreRule[]): DraftMap {
  return Object.fromEntries(rules.map(r => [r.id, { points: String(r.points), isActive: r.isActive }]))
}

// Valid: integer in [-100, 100].
function parsePoints(raw: string): number | null {
  const s = raw.trim()
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  if (!Number.isInteger(n) || n < -100 || n > 100) return null
  return n
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function RuleRow({
  rule, entry, canEdit, onChange,
}: {
  rule: ScoreRule
  entry: DraftEntry
  canEdit: boolean
  onChange: (next: DraftEntry) => void
}) {
  const invalid = parsePoints(entry.points) === null
  const sideEffect = rule.sideEffect ? SIDE_EFFECT_LABELS[rule.sideEffect] : null

  const nombre = rule.label ?? rule.matchValue ?? rule.dimension

  return (
    <div className="settings-rule" data-inactive={entry.isActive ? undefined : ''}>
      <div className="settings-rule-name">
        {nombre}
        {sideEffect && <div className="settings-rule-effect">{sideEffect}</div>}
      </div>

      <div className="settings-rule-controls">
        <input
          type="text"
          inputMode="numeric"
          className={`settings-input settings-rule-points${invalid ? ' settings-input-invalid' : ''}`}
          aria-label={`Puntos de ${nombre}`}
          aria-invalid={invalid}
          value={entry.points}
          disabled={!canEdit}
          onChange={e => onChange({ ...entry, points: e.target.value })}
        />

        {/* is_active toggle */}
        <button
          type="button"
          className="settings-toggle"
          aria-pressed={entry.isActive}
          disabled={!canEdit}
          onClick={() => onChange({ ...entry, isActive: !entry.isActive })}
        >
          {entry.isActive ? 'Activa' : 'Inactiva'}
        </button>
      </div>
    </div>
  )
}

// ─── Alcance ──────────────────────────────────────────────────────────────────
// Los puntos son ajustables pero las bandas son fijas. Sin este panel, bajar los
// puntos lo suficiente deja la banda Caliente inalcanzable y el pipeline plano en
// "Nuevo" — sin error y sin aviso. Se recalcula con cada tecla, sobre el
// BORRADOR, así que el efecto se ve antes de guardar.
function ReachPanel({ reach }: { reach: ReturnType<typeof computeScoreReach> }) {
  const { reachable, bestFit, engagement, manual, warnings } = reach

  // La pregunta útil no es "cuántos puntos suma la configuración" sino "¿puede
  // un lead llegar a cada banda?". Eso es lo que se rompe al bajar los puntos, y
  // es lo que se responde de un vistazo. El techo teórico sin tope (que podía dar
  // 240) no le dice nada a nadie: se omite.
  const bandas = [
    { desde: QUALITY_CUTS.alta,       label: QUALITY_CONFIG.alta.label,       color: QUALITY_CONFIG.alta.color },
    { desde: QUALITY_CUTS.media_alta, label: QUALITY_CONFIG.media_alta.label, color: QUALITY_CONFIG.media_alta.color },
    { desde: QUALITY_CUTS.media,      label: QUALITY_CONFIG.media.label,      color: QUALITY_CONFIG.media.color },
  ]

  return (
    <div className={warnings.length ? 'settings-card-alert-wrap' : undefined}>
      <SettingsCard
        title="Alcance de esta configuración"
        action={(
          <InfoHint label="Qué mide el alcance">
            Con pocos leads activos las bandas de calidad usan cortes fijos. Esto comprueba que un lead pueda llegar a ellas.
          </InfoHint>
        )}
      >
        {/* Alcanzabilidad por banda — la respuesta directa */}
        <div className="settings-band-list">
          {bandas.map(b => {
            const ok = reachable >= b.desde
            return (
              <span key={b.label} className="settings-band" data-ok={ok}>
                <span className="settings-band-dot" style={{ background: ok ? b.color : 'var(--alert)' }} />
                {b.label} {ok ? 'alcanzable' : 'fuera de alcance'}
              </span>
            )
          })}
        </div>

        <div className="settings-reach-lead">
          El mejor lead posible llega a <strong>{reachable}</strong> de 100
        </div>

        {/* Regla 0-100 con los cortes de banda marcados */}
        <div className="settings-reach-bar">
          <div className="settings-reach-fill" style={{ width: `${reachable}%` }} />
          {bandas.map(b => (
            <span key={b.label} className="settings-reach-cut" style={{ left: `${b.desde}%`, background: b.color }} />
          ))}
        </div>

        <div className="settings-reach-parts">
          <span>Mejor perfil <strong>{bestFit}</strong></span>
          <span>+ Actividad <strong>{engagement}</strong></span>
          <span>+ Acciones del agente <strong>{manual}</strong></span>
        </div>

        {warnings.map(w => (
          <div key={w.code} className="settings-alert settings-alert-block settings-alert-wide settings-alert-gap" role="alert">
            <TriangleAlert size={14} aria-hidden="true" />
            <span>{w.message}</span>
          </div>
        ))}
      </SettingsCard>
    </div>
  )
}

// ─── Section ────────────────────────────────────────────────────────────────────

export function ScoringSection({ rules, canEdit, recommended }: {
  rules: ScoreRule[]
  canEdit: boolean
  // Valores recomendados por ITMANO (reglas globales) por id de regla.
  recommended?: Record<string, { points: number; isActive: boolean }>
}) {
  const [draft, setDraft]       = useState<DraftMap>(() => buildDraft(rules))
  const [baseline, setBaseline] = useState<DraftMap>(() => buildDraft(rules))
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)
  // Doble confirmación antes de aplicar un cambio de scoring (afecta cómo se
  // priorizan los leads y recalcula sus scores).
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0)
  const [pending, startTransition] = useTransition()

  const { fitGroups, engagement, manual } = useMemo(() => {
    const byPointsDesc = (a: ScoreRule, b: ScoreRule) => b.points - a.points
    const fit    = rules.filter(r => r.category === 'fit')
    const engRaw = rules.filter(r => r.category === 'engagement').sort(byPointsDesc)
    const manRaw = rules.filter(r => r.category === 'manual').sort(byPointsDesc)

    const dims = new Map<string, ScoreRule[]>()
    for (const r of fit) {
      if (!dims.has(r.dimension)) dims.set(r.dimension, [])
      dims.get(r.dimension)!.push(r)
    }
    const ordered = [...dims.keys()].sort(
      (a, b) => (FIT_DIMENSION_ORDER.indexOf(a) + 1 || 99) - (FIT_DIMENSION_ORDER.indexOf(b) + 1 || 99)
    )
    const fitGroups = ordered.map(dim => ({
      dimension: dim,
      label: DIMENSION_LABELS[dim] ?? dim,
      rules: dims.get(dim)!.sort(byPointsDesc),
    }))
    return { fitGroups, engagement: engRaw, manual: manRaw }
  }, [rules])

  // Alcance del BORRADOR, no de lo guardado: el usuario ve el efecto de lo que
  // está escribiendo antes de confirmar. Un valor a medio teclear ("-", "1x")
  // cae a 0 en vez de romper el cálculo.
  const reach = useMemo(() => {
    const draftRules: ReachRule[] = rules.map(r => ({
      category:  r.category,
      dimension: r.dimension,
      points:    parsePoints(draft[r.id]?.points ?? '') ?? 0,
      isActive:  draft[r.id]?.isActive ?? r.isActive,
    }))
    return computeScoreReach(draftRules)
  }, [rules, draft])

  const dirty = rules.some(r => {
    const d = draft[r.id]; const b = baseline[r.id]
    return d && b && (d.points !== b.points || d.isActive !== b.isActive)
  })
  const hasInvalid = rules.some(r => parsePoints(draft[r.id]?.points ?? '0') === null)

  function update(id: string, next: DraftEntry) {
    setSaved(false)
    setConfirmStep(0)
    setDraft(prev => ({ ...prev, [id]: next }))
  }

  // Inicia el flujo de doble confirmación (valida primero).
  function requestSave() {
    setError(null); setSaved(false)
    if (!dirty || hasInvalid) return
    setConfirmStep(1)
  }

  function handleSave() {
    setError(null); setSaved(false)
    const changed = rules.filter(r => {
      const d = draft[r.id]; const b = baseline[r.id]
      return d.points !== b.points || d.isActive !== b.isActive
    })
    if (changed.length === 0) { setConfirmStep(0); return }

    const payload: { id: string; points: number; isActive: boolean }[] = []
    for (const r of changed) {
      const points = parsePoints(draft[r.id].points)
      if (points === null) {
        setError('Los puntos deben ser números enteros entre -100 y 100.')
        return
      }
      payload.push({ id: r.id, points, isActive: draft[r.id].isActive })
    }

    startTransition(async () => {
      const res = await updateScoreRules(payload)
      if (!res.ok) { setError(res.error); setConfirmStep(0); return }
      // Normalize the draft (trim/parse) and adopt it as the new baseline.
      const normalized: DraftMap = { ...draft }
      for (const p of payload) normalized[p.id] = { points: String(p.points), isActive: p.isActive }
      setDraft(normalized)
      setBaseline(normalized)
      setSaved(true)
      setConfirmStep(0)
    })
  }

  const changedCount = rules.filter(r => {
    const d = draft[r.id]; const b = baseline[r.id]
    return d && b && (d.points !== b.points || d.isActive !== b.isActive)
  }).length

  // ── Restablecer a los valores recomendados por ITMANO ──────────────────────
  // Lleva el borrador a las reglas globales; el usuario aún confirma y guarda.
  const differsFromRecommended = !!recommended && rules.some(r => {
    const rec = recommended[r.id]; const d = draft[r.id]
    return rec && d && (String(rec.points) !== d.points || rec.isActive !== d.isActive)
  })
  function resetToRecommended() {
    if (!recommended) return
    setError(null); setSaved(false); setConfirmStep(0)
    setDraft(prev => {
      const next: DraftMap = { ...prev }
      for (const r of rules) {
        const rec = recommended[r.id]
        if (rec) next[r.id] = { points: String(rec.points), isActive: rec.isActive }
      }
      return next
    })
  }

  const bloqueado = !dirty || hasInvalid || pending || confirmStep > 0

  return (
    <div className="settings-stack">
      {/* Intro — el copy cambia según quién mira. Para el cliente esto no es una
          pantalla de configuración: es la explicación de cómo se califican sus
          leads, que es parte de lo que está comprando. */}
      <p className="settings-note">
        {canEdit
          ? 'Estos son los valores globales del modelo. Aplican a todos los tenants.'
          : 'Así calificamos tus leads. Cada señal suma o resta puntos, y el total determina la temperatura que ves en el pipeline.'}
      </p>

      {!canEdit && (
        <div className="settings-panel">
          <p className="settings-note">
            El modelo lo mantiene ITMANO y se calibra con lo que aprendemos de todas las
            operaciones. Si tu equipo necesita un ajuste, escríbenos y lo evaluamos.
          </p>
        </div>
      )}

      {/* Solo para quien puede editar: es una red de seguridad de ajuste,
          no información que el cliente necesite ver. */}
      {canEdit && <ReachPanel reach={reach} />}

      {/* AUTOMÁTICO */}
      <SettingsCard
        title="Automático"
        action={(
          <InfoHint label="Qué es el scoring automático">
            Perfil (fit) y señales de actividad — se aplican sin intervención del agente.
          </InfoHint>
        )}
      >
        <div className="settings-group-title">Fit · perfil del lead</div>
        {fitGroups.map(group => (
          <div key={group.dimension}>
            <div className="settings-dim-title">{group.label}</div>
            {group.rules.map(r => (
              <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
                onChange={next => update(r.id, next)} />
            ))}
          </div>
        ))}

        <div className="settings-group-title">Engagement · señales de actividad</div>
        {engagement.map(r => (
          <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
            onChange={next => update(r.id, next)} />
        ))}
      </SettingsCard>

      {/* MANUAL */}
      <SettingsCard
        title="Manual"
        action={(
          <InfoHint label="Qué es el scoring manual">
            Acciones que el agente registra durante el seguimiento.
          </InfoHint>
        )}
      >
        {manual.map(r => (
          <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
            onChange={next => update(r.id, next)} />
        ))}
      </SettingsCard>

      {/* Footer */}
      {canEdit && (
        <>
          {/* Doble confirmación */}
          {confirmStep > 0 && (
            <div className="settings-panel settings-panel-gold">
              <p className="settings-confirm-text">
                {confirmStep === 1 ? (
                  <>Vas a cambiar <strong>{changedCount}</strong> {changedCount === 1 ? 'valor' : 'valores'} del scoring.
                    Esto afecta cómo se priorizan tus leads y recalcula sus scores. ¿Continuar?</>
                ) : (
                  <><strong>Confirmación final.</strong> Los cambios se aplican al
                    instante y los scores de tus leads se recalcularán. ¿Aplicar los cambios?</>
                )}
              </p>
              <div className="settings-actions settings-actions-end">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmStep(0)}>
                  Cancelar
                </button>
                {confirmStep === 1 ? (
                  <button type="button" className="btn btn-primary" onClick={() => setConfirmStep(2)}>Continuar →</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={handleSave} disabled={pending}>
                    {pending ? 'Aplicando…' : 'Aplicar cambios'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="settings-footer">
            {error && <span className="settings-footer-msg settings-footer-msg-error" role="alert">{error}</span>}
            {saved && !dirty && <span className="settings-footer-msg settings-footer-msg-ok">Cambios guardados.</span>}
            {recommended && (
              <button
                type="button"
                className="btn btn-ghost settings-footer-start"
                onClick={resetToRecommended}
                disabled={!differsFromRecommended || pending || confirmStep > 0}
                title="Lleva todos los puntos a los valores recomendados por ITMANO (luego confirma y guarda)."
              >
                Restablecer a recomendados
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={requestSave} disabled={bloqueado}>
              Guardar cambios
            </button>
          </div>
        </>
      )}
    </div>
  )
}
