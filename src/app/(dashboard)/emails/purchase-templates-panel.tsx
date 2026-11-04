'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, LayoutTemplate, X, type LucideIcon } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { AgentPurchaseTemplates, PurchaseTemplateRow } from './purchase-templates-actions'
import { updatePurchaseTemplate, updatePurchaseTemplateContent, clearPurchaseTemplateContent } from './purchase-templates-actions'
import {
  EmailComposer,
  composerValueFrom,
  composerValueToInput,
  type ComposerValue,
} from '@/components/dashboard/email-composer'
import { cellState, isPlaceholder, type PurchaseCellState } from '@/lib/emails/purchase-state'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
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

const LANG_LABEL: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGE_CODES.map(c => [c, LANGUAGE_CONFIG[c].label])
)
const MILESTONES = ['start', 'pre_close', 'completed'] as const

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
              // El template es de este agente y el envío real lo firma él
              // (send-purchase-email lee agents.email_signature): la vista
              // previa muestra esa misma firma, no una de muestra.
              previewContext={{ agentId: row.agent_id }}
            />
            {error && <div style={{ fontSize: '12px', color: 'var(--alert)', marginTop: '12px' }}>{error}</div>}
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
            {error && <div style={{ fontSize: '12px', color: 'var(--alert)', marginTop: '12px' }}>{error}</div>}
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

// ─── Matriz ───────────────────────────────────────────────────────────────────
// Una tarjeta con una fila por agente y una columna por hito. Cada celda lleva un
// botón por idioma que atiende el agente; el estado se lee por icono y por texto
// accesible, no sólo por color. Un solo EditModal vive en el panel: un clic abre
// exactamente uno.

const STATE_META: Record<PurchaseCellState, { label: string; color: string; Icon: LucideIcon }> = {
  crm:      { label: 'Contenido CRM',   color: 'var(--accent-gold)',  Icon: Check },
  template: { label: 'Template Resend', color: 'var(--accent-blue)',  Icon: LayoutTemplate },
  empty:    { label: 'Sin configurar',  color: 'var(--accent-coral)', Icon: AlertTriangle },
}

const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
  minWidth: '44px', minHeight: '28px', padding: '0 8px', borderRadius: '8px',
  fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
}

function LangCell({
  row, agentName, readOnly, onEdit,
}: {
  row: PurchaseTemplateRow | undefined
  agentName: string
  readOnly: boolean
  onEdit: (row: PurchaseTemplateRow) => void
}) {
  if (!row) return <span aria-label="Sin correo" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
  const meta = STATE_META[cellState(row)]
  const label = `${MILESTONE_LABEL[row.milestone]}, ${LANG_LABEL[row.language]}: ${meta.label}`
  const style: React.CSSProperties = {
    ...CHIP, color: meta.color,
    background: `color-mix(in srgb, ${meta.color} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${meta.color} 28%, transparent)`,
  }
  const content = (
    <>
      <meta.Icon size={12} aria-hidden />
      {row.language.toUpperCase()}
    </>
  )
  if (readOnly) {
    return <span role="img" aria-label={label} title={label} style={style}>{content}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(row)}
      aria-label={label}
      title={`${label} (${agentName}). Editar`}
      style={{ ...style, cursor: 'pointer' }}
    >
      {content}
    </button>
  )
}

const TH: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'center', fontSize: '11px', fontWeight: 500,
  color: 'var(--text-muted)', background: 'var(--bg-elevated)',
  borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap',
}

export function PurchaseTemplatesPanel({
  agents,
  tenantName,
  readOnly = false,
}: {
  agents: AgentPurchaseTemplates[]
  tenantName?: string
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState<{ row: PurchaseTemplateRow; agentName: string } | null>(null)

  return (
    <>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflowX: 'auto' }}>
        <table aria-label="Correos de cierre por agente e idioma" style={{ width: '100%', minWidth: '560px', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1 }}>Agente</th>
              {MILESTONES.map(m => <th key={m} scope="col" style={TH}>{MILESTONE_LABEL[m]}</th>)}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, i) => {
              const byKey = Object.fromEntries(agent.templates.map(t => [`${t.milestone}_${t.language}`, t]))
              // Orden estable por el catálogo, sólo los idiomas que atiende el agente.
              const langs = SUPPORTED_LANGUAGE_CODES.filter(l => agent.languages.includes(l))
              const rowBorder = i > 0 ? '1px solid var(--border-subtle)' : undefined
              return (
                <tr key={agent.agent_id}>
                  <th scope="row" style={{
                    padding: '10px 12px', textAlign: 'left', fontWeight: 400, borderTop: rowBorder,
                    position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg-surface)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span aria-hidden style={{
                        width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)',
                      }}>
                        {agent.agent_name.trim().slice(0, 2).toUpperCase()}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.agent_name}</span>
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {langs.map(l => LANG_LABEL[l]).join(' · ')}
                        </span>
                      </span>
                    </div>
                  </th>
                  {MILESTONES.map(m => (
                    <td key={m} style={{ padding: '10px 12px', textAlign: 'center', borderTop: rowBorder }}>
                      <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {langs.map(l => (
                          <LangCell
                            key={l}
                            row={byKey[`${m}_${l}`]}
                            agentName={agent.agent_name}
                            readOnly={readOnly}
                            onEdit={row => setEditing({ row, agentName: agent.agent_name })}
                          />
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <EditModal
          key={editing.row.id}
          row={editing.row}
          tenantName={tenantName}
          agentName={editing.agentName}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
