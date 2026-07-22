'use client'

import { useMemo, useState, useTransition } from 'react'
import type { ScoreRule } from '@/lib/data/score-rules'
import { updateScoreRules } from './actions'

// ─── Style constants ──────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
  marginBottom: '16px',
}

const CARD_HEADER: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
}

const SUBHEADER: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  padding: '14px 20px 6px',
}

const DIM_HEADER: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  padding: '10px 20px 2px',
}

const POINTS_INPUT: React.CSSProperties = {
  width: '64px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '6px 8px',
  fontSize: '13px',
  fontWeight: 600,
  textAlign: 'center',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

// ─── Vocabulary labels (display only — never editable) ──────────────────────────

const FIT_DIMENSION_ORDER = [
  'timeline', 'financing', 'budget_tier', 'agent_status', 'sell_motivation', 'listing_status',
]

const DIMENSION_LABELS: Record<string, string> = {
  timeline:        'Horizonte de compra',
  financing:       'Financiamiento',
  budget_tier:     'Presupuesto',
  agent_status:    'Relación con agente',
  sell_motivation: 'Motivación de venta',
  listing_status:  'Estado del listado',
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '9px 20px',
      borderTop: '1px solid var(--border-subtle)',
      opacity: entry.isActive ? 1 : 0.55,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          {rule.label ?? rule.matchValue ?? rule.dimension}
        </div>
        {sideEffect && (
          <div style={{ fontSize: '11px', color: 'var(--accent-coral)', marginTop: '2px' }}>
            {sideEffect}
          </div>
        )}
      </div>

      {/* Points */}
      <input
        type="text"
        inputMode="numeric"
        value={entry.points}
        disabled={!canEdit}
        onChange={e => onChange({ ...entry, points: e.target.value })}
        style={{
          ...POINTS_INPUT,
          borderColor: invalid ? 'var(--accent-coral)' : 'var(--border-subtle)',
          cursor: canEdit ? 'text' : 'default',
        }}
      />

      {/* is_active toggle */}
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onChange({ ...entry, isActive: !entry.isActive })}
        style={{
          width: '78px',
          fontSize: '11px',
          fontWeight: 500,
          padding: '6px 0',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          background: entry.isActive ? 'rgba(107,163,104,0.14)' : 'var(--bg-elevated)',
          color: entry.isActive ? 'var(--accent-green)' : 'var(--text-muted)',
          cursor: canEdit ? 'pointer' : 'default',
        }}
      >
        {entry.isActive ? 'Activa' : 'Inactiva'}
      </button>
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

  return (
    <div>
      {/* Intro */}
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5 }}>
        Los valores mostrados son los recomendados, pero puedes ajustarlos según tu operación.
      </p>

      {!canEdit && (
        <div style={{
          fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px', marginBottom: '16px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px',
        }}>
          Estos valores los administra ITMANO. Para ajustarlos a tu operación, contáctanos.
        </div>
      )}

      {/* AUTOMÁTICO */}
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Automático</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Perfil (fit) y señales de actividad — se aplican sin intervención del agente.
          </div>
        </div>

        <div style={SUBHEADER}>Fit · perfil del lead</div>
        {fitGroups.map(group => (
          <div key={group.dimension}>
            <div style={DIM_HEADER}>{group.label}</div>
            {group.rules.map(r => (
              <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
                onChange={next => update(r.id, next)} />
            ))}
          </div>
        ))}

        <div style={SUBHEADER}>Engagement · señales de actividad</div>
        {engagement.map(r => (
          <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
            onChange={next => update(r.id, next)} />
        ))}
      </div>

      {/* MANUAL */}
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Manual</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Acciones que el agente registra durante el seguimiento.
          </div>
        </div>
        {manual.map(r => (
          <RuleRow key={r.id} rule={r} entry={draft[r.id]} canEdit={canEdit}
            onChange={next => update(r.id, next)} />
        ))}
      </div>

      {/* Footer */}
      {canEdit && (
        <>
          {/* Doble confirmación */}
          {confirmStep > 0 && (
            <div style={{
              background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.3)',
              borderRadius: '10px', padding: '14px 16px', marginBottom: '12px',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                {confirmStep === 1 ? (
                  <>Vas a cambiar <strong>{changedCount}</strong> {changedCount === 1 ? 'valor' : 'valores'} del scoring.
                    Esto afecta cómo se priorizan tus leads y recalcula sus scores. ¿Continuar?</>
                ) : (
                  <><strong style={{ color: 'var(--accent-gold)' }}>Confirmación final.</strong> Los cambios se aplican al
                    instante y los scores de tus leads se recalcularán. ¿Aplicar los cambios?</>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmStep(0)}
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                {confirmStep === 1 ? (
                  <button onClick={() => setConfirmStep(2)} style={{ ...BTN_PRIMARY }}>Continuar →</button>
                ) : (
                  <button onClick={handleSave} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
                    {pending ? 'Aplicando…' : 'Aplicar cambios'}
                  </button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
            {error && <span style={{ fontSize: '12px', color: 'var(--accent-coral)', flex: 1 }}>{error}</span>}
            {saved && !dirty && <span style={{ fontSize: '12px', color: 'var(--accent-green)', flex: 1 }}>Cambios guardados.</span>}
            {recommended && (
              <button
                onClick={resetToRecommended}
                disabled={!differsFromRecommended || pending || confirmStep > 0}
                title="Lleva todos los puntos a los valores recomendados por ITMANO (luego confirma y guarda)."
                style={{
                  marginRight: 'auto',
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  color: (!differsFromRecommended || pending || confirmStep > 0) ? 'var(--text-muted)' : 'var(--text-secondary)',
                  cursor: (!differsFromRecommended || pending || confirmStep > 0) ? 'not-allowed' : 'pointer',
                }}
              >
                Restablecer a recomendados
              </button>
            )}
            <button
              onClick={requestSave}
              disabled={!dirty || hasInvalid || pending || confirmStep > 0}
              style={{
                ...BTN_PRIMARY,
                background: (!dirty || hasInvalid || pending || confirmStep > 0) ? 'var(--bg-overlay)' : 'var(--accent-gold)',
                color:      (!dirty || hasInvalid || pending || confirmStep > 0) ? 'var(--text-muted)' : 'var(--bg-base)',
                cursor:     (!dirty || hasInvalid || pending || confirmStep > 0) ? 'not-allowed' : 'pointer',
              }}
            >
              Guardar cambios
            </button>
          </div>
        </>
      )}
    </div>
  )
}
