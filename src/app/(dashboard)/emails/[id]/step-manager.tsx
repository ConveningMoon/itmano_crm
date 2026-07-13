'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, X, AlertTriangle, Mail } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { SequenceStep } from '@/lib/data/email-sequences'
import type { StepMetric } from '@/lib/services/email-metrics'
import { addStep, updateStep, deleteStep, type StepInput } from '../actions'
import {
  EmailComposer,
  emptyComposerValue,
  composerValueFrom,
  composerValueToInput,
  type ComposerValue,
} from '@/components/dashboard/email-composer'
import { parseEmailContent } from '@/lib/email-content'

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

function delayLabel(hours: number): string {
  if (hours === 0) return 'Inmediato'
  if (hours < 24)  return `${hours}h después del anterior`
  const days = Math.round(hours / 24)
  return `${days} día${days !== 1 ? 's' : ''} después del anterior`
}

interface StepFormState {
  delayHours:       number
  contentMode:      'crm' | 'template'
  resendTemplateId: string
  composer:         ComposerValue
}

interface Props {
  sequenceId:  string
  steps:       SequenceStep[]
  stepMetrics?: StepMetric[]
  // Contexto para preview + generación con IA
  language?:       'es' | 'en' | 'pt'
  tenantId?:       string
  tenantName?:     string
  agentName?:      string
  leadMagnetName?: string
}

export function StepManager({
  sequenceId, steps: initialSteps, stepMetrics,
  language = 'es', tenantId, tenantName, agentName, leadMagnetName,
}: Props) {
  const router   = useRouter()
  const [mode,    setMode]    = useState<'idle' | 'add' | 'edit' | 'confirm_delete'>('idle')
  const [target,  setTarget]  = useState<string | null>(null)   // stepId for edit/delete
  const [form,    setForm]    = useState<StepFormState>({
    delayHours: 0, contentMode: 'crm', resendTemplateId: '', composer: emptyComposerValue(),
  })
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

  // Sort by step_order for display
  const steps = [...initialSteps].sort((a, b) => a.stepOrder - b.stepOrder)

  const metricsMap = new Map((stepMetrics ?? []).map(m => [m.stepOrder, m]))

  function openAdd() {
    setForm({
      delayHours:       steps.length === 0 ? 0 : 72,
      contentMode:      'crm',
      resendTemplateId: '',
      composer:         emptyComposerValue(),
    })
    setError(null)
    setMode('add')
  }

  function openEdit(step: SequenceStep) {
    setTarget(step.id)
    const hasCrmContent = parseEmailContent(step.bodyJson) !== null
    setForm({
      delayHours:       step.delayHours,
      contentMode:      hasCrmContent ? 'crm' : 'template',
      resendTemplateId: step.resendTemplateId ?? '',
      composer:         composerValueFrom(step.subject, step.bodyJson),
    })
    setError(null)
    setMode('edit')
  }

  function openDelete(stepId: string) {
    setTarget(stepId)
    setError(null)
    setMode('confirm_delete')
  }

  function closeModal() { setMode('idle'); setTarget(null); setError(null) }

  // Construye el payload de la action según el modo; null + error visible si falta algo.
  function buildStepInput(): StepInput | null {
    if (form.contentMode === 'template') {
      if (!form.resendTemplateId.trim()) { setError('El Template ID es obligatorio'); return null }
      return { mode: 'template', delayHours: form.delayHours, resendTemplateId: form.resendTemplateId }
    }
    const input = composerValueToInput(form.composer)
    if (!input.ok) { setError(input.error); return null }
    return { mode: 'crm', delayHours: form.delayHours, subject: input.subject, content: input.content }
  }

  function handleAdd() {
    setError(null)
    const input = buildStepInput()
    if (!input) return
    start(async () => {
      const res = await addStep(sequenceId, input)
      if (!res.ok) { setError(res.error); return }
      closeModal()
      router.refresh()
    })
  }

  function handleUpdate() {
    if (!target) return
    setError(null)
    const input = buildStepInput()
    if (!input) return
    start(async () => {
      const res = await updateStep(target, input)
      if (!res.ok) { setError(res.error); return }
      closeModal()
      router.refresh()
    })
  }

  function handleDelete() {
    if (!target) return
    setError(null)
    start(async () => {
      const res = await deleteStep(target, sequenceId)
      if (!res.ok) { setError(res.error); return }
      closeModal()
      router.refresh()
    })
  }

  return (
    <>
      <style>{`
        .sm-input:focus { border-color: var(--border-accent) !important; }
        .step-row { transition: background 0.1s; }
        .step-row:hover { background: var(--bg-elevated) !important; }
      `}</style>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Pasos de la secuencia</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{steps.length} {steps.length === 1 ? 'email' : 'emails'}</span>
          </div>
          <button
            onClick={openAdd}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 500,
              background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
              border: '1px solid rgba(201,169,110,0.2)', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            <Plus size={12} />
            Agregar paso
          </button>
        </div>

        {/* Steps list */}
        {steps.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            <Mail size={20} style={{ marginBottom: '8px', opacity: 0.4 }} color="var(--text-muted)" />
            <div>Sin pasos configurados todavía.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              Agrega el primer paso para comenzar a definir la secuencia.
            </div>
          </div>
        ) : (
          steps.map((step, idx) => (
            <div
              key={step.id}
              className="step-row"
              style={{
                borderTop: idx > 0 ? '1px solid var(--border-subtle)' : undefined,
                padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: '14px',
                background: 'var(--bg-surface)',
              }}
            >
              {/* Position badge */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 600, color: 'var(--accent-gold)',
                flexShrink: 0,
              }}>
                {idx + 1}
              </div>

              {/* Delay */}
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', padding: '3px 8px',
                fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {delayLabel(step.delayHours)}
              </div>

              {/* Contenido (CRM o template) + step metrics */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {parseEmailContent(step.bodyJson) && step.subject ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span style={{
                      flexShrink: 0, fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.12)',
                    }}>
                      CRM
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {step.subject}
                    </span>
                  </span>
                ) : step.resendTemplateId ? (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {step.resendTemplateId}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--accent-coral)', fontStyle: 'italic' }}>
                    Sin contenido — el cron pausará este paso
                  </span>
                )}
                {(() => {
                  const sm = metricsMap.get(step.stepOrder)
                  if (!sm || sm.totalSends === 0) return null
                  return (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                      {[
                        { label: 'Env',   value: String(sm.totalSends), color: 'var(--text-muted)' },
                        { label: 'Click', value: `${sm.clickRate}%`, color: sm.clickRate > 0 ? 'var(--accent-blue)'  : 'var(--text-muted)' },
                        { label: 'Reply', value: `${sm.replyRate}%`, color: sm.replyRate > 0 ? 'var(--accent-green)' : 'var(--text-muted)' },
                      ].map(chip => (
                        <span key={chip.label} style={{ fontSize: '10px', color: chip.color, fontWeight: 500, display: 'flex', gap: '3px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{chip.label}</span>
                          {chip.value}
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                <button
                  onClick={() => openEdit(step)}
                  title="Editar"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => openDelete(step.id)}
                  title="Eliminar"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)', color: 'var(--accent-coral)', cursor: 'pointer' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit step modal */}
      <ModalShell open={mode === 'add' || mode === 'edit'} onClose={closeModal} maxWidth={680}>
          <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {mode === 'add' ? 'Agregar paso' : 'Editar paso'}
              </span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={LABEL}>
                  Delay{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    — horas después del paso anterior (0 = inmediato)
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.delayHours}
                  onChange={e => setForm(f => ({ ...f, delayHours: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="sm-input"
                  style={INPUT}
                />
              </div>

              {/* Modo de contenido: composer del CRM (default) o template de Resend (avanzado) */}
              <div>
                <label style={LABEL}>Contenido del correo</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {([
                    { key: 'crm',      label: 'Crear en el CRM' },
                    { key: 'template', label: 'Template de Resend (avanzado)' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, contentMode: opt.key }))}
                      style={{
                        padding: '6px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer',
                        background: form.contentMode === opt.key ? 'rgba(201,169,110,0.12)' : 'transparent',
                        color: form.contentMode === opt.key ? 'var(--accent-gold)' : 'var(--text-muted)',
                        border: `1px solid ${form.contentMode === opt.key ? 'rgba(201,169,110,0.3)' : 'var(--border-subtle)'}`,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {mode === 'edit' && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Al guardar, el paso usa solo el modo seleccionado (el otro se limpia).
                  </div>
                )}
              </div>

              {form.contentMode === 'crm' ? (
                <EmailComposer
                  value={form.composer}
                  onChange={v => setForm(f => ({ ...f, composer: v }))}
                  locale={language}
                  previewTenantId={tenantId}
                  ai={{
                    purpose:  steps.length === 0 || (mode === 'edit' && form.delayHours === 0) ? 'lead_magnet_delivery' : 'nurture',
                    language,
                    leadMagnetName,
                    agentName,
                    tenantName,
                  }}
                />
              ) : (
                <>
                  <div>
                    <label style={LABEL}>
                      Resend Template ID <span style={{ color: 'var(--accent-coral)' }}>*</span>
                    </label>
                    <input
                      value={form.resendTemplateId}
                      onChange={e => setForm(f => ({ ...f, resendTemplateId: e.target.value }))}
                      placeholder="tmpl_xxxxxxxx o uuid"
                      className="sm-input"
                      style={INPUT}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                      Resend Dashboard → Templates → click en el template → botón &quot;Copy ID&quot;
                    </div>
                  </div>

                  {/* Template variables warning (solo aplica al modo template) */}
                  <div style={{
                    background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.18)',
                    borderRadius: '8px', padding: '12px 14px',
                    fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <AlertTriangle size={13} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                      <strong style={{ color: 'var(--accent-gold)' }}>Variables disponibles en tu template de Resend</strong>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      {`{{{customer_name}}}  {{{agent_name}}}  {{{agent_email}}}`}<br />
                      {`{{{lead_magnet_name}}}  {{{unsubscribe_url}}}`}
                    </div>
                    <div style={{ marginTop: '8px', color: 'var(--accent-coral)' }}>
                      <strong>Usa triple llave</strong> {`{{{variable}}}`}, no doble. No metas {`{{{unsubscribe_url}}}`} dentro de un <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>{`<a href="...">`}</code> — bug conocido de Resend; ponlo como texto plano al final del email.
                    </div>
                  </div>
                </>
              )}
            </div>

            {error && <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginBottom: '12px', padding: '6px 10px', background: 'color-mix(in srgb, var(--status-hot) 8%, transparent)', borderRadius: '6px' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={closeModal} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={mode === 'add' ? handleAdd : handleUpdate}
                disabled={pending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                  cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? 'Guardando...' : mode === 'add' ? 'Agregar paso' : 'Guardar cambios'}
              </button>
            </div>
          </div>
      </ModalShell>

      {/* Delete step confirmation */}
      <ModalShell open={mode === 'confirm_delete'} onClose={closeModal} maxWidth={380}>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar paso</span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              ¿Eliminar este paso? Los leads que estaban esperando este paso seguirán avanzando al siguiente si existe.
            </p>
            {error && <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginBottom: '12px', padding: '6px 10px', background: 'color-mix(in srgb, var(--status-hot) 8%, transparent)', borderRadius: '6px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={closeModal} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={pending} style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
                border: '1px solid rgba(201,123,107,0.3)',
                cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
              }}>{pending ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
      </ModalShell>
    </>
  )
}
