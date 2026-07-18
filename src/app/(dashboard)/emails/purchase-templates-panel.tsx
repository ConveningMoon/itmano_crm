'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, X, Pencil } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { PurchaseTemplateRow } from './purchase-templates-actions'
import { updatePurchaseTemplate, updatePurchaseTemplateContent, clearPurchaseTemplateContent } from './purchase-templates-actions'
import {
  EmailComposer,
  composerValueFrom,
  composerValueToInput,
  type ComposerValue,
} from '@/components/dashboard/email-composer'
import { parseEmailContent } from '@/lib/email-content'
import type { EmailAiPurpose } from './ai-actions'

const MILESTONE_LABEL: Record<string, string> = {
  start:     'Inicio de proceso',
  pre_close: 'Pre-cierre (día antes)',
  completed: 'Proceso completado',
}

const MILESTONE_PURPOSE: Record<string, EmailAiPurpose> = {
  start:     'purchase_start',
  pre_close: 'purchase_pre_close',
  completed: 'purchase_completed',
}

const LANG_LABEL: Record<string, string>  = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_COLOR: Record<string, string>  = {
  es: 'var(--accent-gold)',
  en: 'var(--accent-blue)',
  pt: 'var(--accent-teal)',
}

const MILESTONES = ['start', 'pre_close', 'completed'] as const

function isPlaceholder(id: string) {
  return !id || id.startsWith('REPLACE_ME')
}

// Estado de una celda: contenido del CRM, template de Resend, o sin configurar.
function cellState(row: PurchaseTemplateRow): 'crm' | 'template' | 'empty' {
  if (parseEmailContent(row.body_json) && row.subject?.trim()) return 'crm'
  if (!isPlaceholder(row.resend_template_id)) return 'template'
  return 'empty'
}

const STATE_META: Record<'crm' | 'template' | 'empty', { label: string; color: string; bg: string }> = {
  crm:      { label: 'Contenido CRM', color: 'var(--accent-gold)',  bg: 'rgba(201,169,110,0.12)' },
  template: { label: 'Template Resend', color: 'var(--accent-blue)', bg: 'rgba(91,142,201,0.12)' },
  empty:    { label: 'Sin configurar', color: 'var(--accent-coral)', bg: 'rgba(201,123,107,0.1)' },
}

// ─── Editor modal ──────────────────────────────────────────────────────────────

function EditModal({
  row, tenantName, agentName, onClose,
}: {
  row: PurchaseTemplateRow
  tenantName?: string
  agentName?: string
  onClose: () => void
}) {
  const router = useRouter()
  const [advanced, setAdvanced] = useState(cellState(row) === 'template')
  const [composer, setComposer] = useState<ComposerValue>(() => composerValueFrom(row.subject, row.body_json))
  const [templateId, setTemplateId] = useState(row.resend_template_id === '' || isPlaceholder(row.resend_template_id) ? '' : row.resend_template_id)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function handleSaveContent() {
    setError(null)
    const input = composerValueToInput(composer)
    if (!input.ok) { setError(input.error); return }
    start(async () => {
      const res = await updatePurchaseTemplateContent(row.id, { subject: input.subject, content: input.content })
      if (!res.ok) { setError(res.error); return }
      onClose()
      router.refresh()
    })
  }

  function handleSaveTemplate() {
    setError(null)
    if (!templateId.trim()) { setError('El Template ID es obligatorio'); return }
    start(async () => {
      // Modo avanzado: guardar el template id Y limpiar el contenido CRM para que
      // el envío use el template (la precedencia es body_json > template).
      const res = await updatePurchaseTemplate(row.id, templateId.trim())
      if (!res.ok) { setError(res.error); return }
      if (cellState(row) === 'crm') await clearPurchaseTemplateContent(row.id)
      onClose()
      router.refresh()
    })
  }

  return (
    <ModalShell open onClose={onClose} maxWidth={680}>
      <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {MILESTONE_LABEL[row.milestone]} · {LANG_LABEL[row.language]}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>
        {(agentName || tenantName) && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
            {[agentName, tenantName].filter(Boolean).join(' · ')}
          </div>
        )}

        {!advanced ? (
          <>
            <EmailComposer
              value={composer}
              onChange={setComposer}
              locale={row.language}
              ai={{
                purpose:    MILESTONE_PURPOSE[row.milestone],
                language:   row.language,
                tenantName,
              }}
            />
            {error && <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginTop: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setAdvanced(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
                Usar template de Resend (avanzado)
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveContent} disabled={pending} style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1 }}>
                  {pending ? 'Guardando…' : 'Guardar contenido'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>
              Resend Template ID
            </label>
            <input
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              placeholder="resend_template_id"
              style={{ width: '100%', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Al guardar el template, se descarta el contenido creado en el CRM para este correo.
            </div>
            {error && <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginTop: '12px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <button onClick={() => setAdvanced(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
                ← Crear contenido en el CRM
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveTemplate} disabled={pending} style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1 }}>
                  {pending ? 'Guardando…' : 'Guardar template'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// ─── Cell (status chip + edit button) ────────────────────────────────────────────

function TemplateCell({
  row, tenantName, agentName, readOnly,
}: {
  row: PurchaseTemplateRow
  tenantName?: string
  agentName?: string
  readOnly: boolean
}) {
  const [open, setOpen] = useState(false)
  const state = cellState(row)
  const meta  = STATE_META[state]

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.04em', color: meta.color, background: meta.bg,
        }}>
          {state === 'empty' && <AlertTriangle size={10} />}
          {state === 'crm' && <Check size={10} />}
          {meta.label}
        </span>
        {!readOnly && (
          <button
            onClick={() => setOpen(true)}
            title="Editar"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px',
              borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Pencil size={11} />
          </button>
        )}
      </div>
      {open && <EditModal row={row} tenantName={tenantName} agentName={agentName} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────
// Un panel por agente: columnas = idiomas registrados del agente
// (agents.languages). El título/subtítulo general lo pone la página; aquí va
// la cabecera del agente.

export function PurchaseTemplatesPanel({
  templates,
  agentName,
  accentColor,
  languages,
  tenantName,
  readOnly = false,
}: {
  templates: PurchaseTemplateRow[]
  agentName: string
  accentColor?: string
  languages: string[]
  tenantName?: string
  readOnly?: boolean
}) {
  const byKey = Object.fromEntries(templates.map(t => [`${t.milestone}_${t.language}`, t]))
  const langs = (['es', 'en', 'pt'] as const).filter(l => languages.includes(l))
  const color = accentColor ?? 'var(--accent-gold)'

  const shown = templates.filter(t => languages.includes(t.language))
  const pendingCount = shown.filter(t => cellState(t) === 'empty').length

  return (
    <div style={{ marginTop: '24px' }}>
      {/* Agent header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          background: `${color}22`, border: `1px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 700, color, flexShrink: 0,
        }}>
          {agentName.trim().slice(0, 2).toUpperCase()}
        </div>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{agentName}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {langs.map(l => LANG_LABEL[l]).join(' · ')}
          </span>
        </div>
        {pendingCount > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', fontWeight: 500,
            color: 'var(--accent-coral)',
            background: 'rgba(201,123,107,0.1)',
            border: '1px solid rgba(201,123,107,0.25)',
            borderRadius: '6px', padding: '3px 10px',
          }}>
            <AlertTriangle size={11} />
            {pendingCount} sin configurar
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: `180px repeat(${langs.length}, 1fr)`,
          padding: '10px 16px', background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Hito
          </span>
          {langs.map(l => (
            <span key={l} style={{
              fontSize: '10px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: LANG_COLOR[l],
            }}>
              {LANG_LABEL[l]}
            </span>
          ))}
        </div>

        {MILESTONES.map((milestone, idx) => (
          <div
            key={milestone}
            style={{
              display: 'grid', gridTemplateColumns: `180px repeat(${langs.length}, 1fr)`,
              padding: '14px 16px',
              borderTop: idx > 0 ? '1px solid var(--border-subtle)' : undefined,
              alignItems: 'center', gap: '12px',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {MILESTONE_LABEL[milestone]}
            </span>
            {langs.map(lang => {
              const row = byKey[`${milestone}_${lang}`]
              if (!row) return <span key={lang} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
              return <TemplateCell key={lang} row={row} tenantName={tenantName} agentName={agentName} readOnly={readOnly} />
            })}
          </div>
        ))}
      </div>

    </div>
  )
}
