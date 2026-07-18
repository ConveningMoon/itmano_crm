'use client'

import { useRef, useState, useTransition } from 'react'
import { Eye, Sparkles, X } from 'lucide-react'
import type { EmailContent } from '@/lib/email-content'
import { EmailContentSchema, MERGE_TAGS, EMAIL_CONTENT_VERSION } from '@/lib/email-content'
import { previewEmailHtml } from '@/app/(dashboard)/emails/actions'
import { generateEmailDraft, type EmailAiPurpose } from '@/app/(dashboard)/emails/ai-actions'
import type { Language } from '@/lib/types'

// Composer de correos del CRM. Lo comparten tres superficies: pasos de secuencia
// (step-manager), correos de hitos de compra (purchase-templates-panel) y envío
// one-off desde el detalle del lead.
//
// El correo se redacta como un mensaje personal: asunto + un único cuerpo de
// texto libre (sin párrafos estructurados, sin botón CTA). La firma NO se edita
// aquí — se configura por agente en Configuración → Email y se agrega
// automáticamente al final. El HTML final lo compila el servidor
// (email-render.ts vía previewEmailHtml / send services).

// ─── Value model ──────────────────────────────────────────────────────────────

export interface ComposerValue {
  subject: string
  body:    string
}

export function emptyComposerValue(): ComposerValue {
  return { subject: '', body: '' }
}

// Reconstruye el estado del composer desde una fila de la DB (subject + body_json).
export function composerValueFrom(subject: string | null, bodyJson: unknown): ComposerValue {
  const parsed = EmailContentSchema.safeParse(bodyJson)
  return { subject: subject ?? '', body: parsed.success ? parsed.data.body : '' }
}

// Convierte el estado del composer al payload de las actions. Devuelve un error
// legible si falta algo (la validación dura la repite el server con zod).
export function composerValueToInput(
  v: ComposerValue,
): { ok: true; subject: string; content: EmailContent } | { ok: false; error: string } {
  const subject = v.subject.trim()
  if (!subject) return { ok: false, error: 'El asunto es obligatorio' }

  const body = v.body.trim()
  if (!body) return { ok: false, error: 'El correo necesita un mensaje' }

  const content: EmailContent = { v: EMAIL_CONTENT_VERSION, body }
  const parsed = EmailContentSchema.safeParse(content)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Contenido inválido' }
  return { ok: true, subject, content: parsed.data }
}

// ─── Styles (consistentes con step-manager.tsx) ──────────────────────────────

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

// ─── AI form ──────────────────────────────────────────────────────────────────

const TONE_OPTIONS = [
  'Cercano y cálido',
  'Casual y directo',
  'Cordial y profesional',
  'Entusiasta pero genuino',
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export interface ComposerAiContext {
  purpose:        EmailAiPurpose
  language:       Language
  agentName?:     string
  tenantName?:    string
  leadFirstName?: string
}

interface Props {
  value:    ComposerValue
  onChange: (v: ComposerValue) => void
  // Idioma del footer/preview (idioma de la secuencia / del template / del lead).
  locale?:  Language
  // Contexto para "Generar con IA"; sin él, el botón no se muestra.
  ai?: ComposerAiContext
  // Contexto para que la vista previa muestre la FIRMA REAL del agente que
  // firmaría el envío (por lead en one-off, o por secuencia en steps).
  previewContext?: { leadId?: string; sequenceId?: string }
}

export function EmailComposer({ value, onChange, locale = 'es', ai, previewContext }: Props) {
  const [previewHtml, setPreviewHtml]   = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview]      = useTransition()

  // Estado del formulario de IA.
  const [aiOpen, setAiOpen]     = useState(false)
  const [aiObjective, setAiObjective] = useState('')
  const [aiTone, setAiTone]     = useState<string>(TONE_OPTIONS[0])
  const [aiIdea, setAiIdea]     = useState('')
  const [aiPoints, setAiPoints] = useState('')
  const [aiLength, setAiLength] = useState<'short' | 'medium'>('short')
  const [aiError, setAiError]   = useState<string | null>(null)
  const [aiBusy, startAi]       = useTransition()

  // Última posición del cursor en el cuerpo, para insertar merge tags.
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  function set<K extends keyof ComposerValue>(key: K, val: ComposerValue[K]) {
    onChange({ ...value, [key]: val })
  }

  function insertTag(tag: string) {
    const el = bodyRef.current
    if (!el) { set('body', value.body + tag); return }
    const start = el.selectionStart ?? value.body.length
    const end   = el.selectionEnd ?? value.body.length
    const next  = value.body.slice(0, start) + tag + value.body.slice(end)
    set('body', next)
    // Reposiciona el cursor tras el tag insertado.
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + tag.length
      el.setSelectionRange(pos, pos)
    })
  }

  function handlePreview() {
    setPreviewError(null)
    const input = composerValueToInput(value)
    if (!input.ok) { setPreviewError(input.error); return }
    startPreview(async () => {
      const res = await previewEmailHtml({
        subject:    input.subject,
        content:    input.content,
        locale,
        leadId:     previewContext?.leadId,
        sequenceId: previewContext?.sequenceId,
      })
      if (!res.ok) { setPreviewError(res.error); return }
      setPreviewHtml(res.html)
    })
  }

  function handleGenerate() {
    if (!ai) return
    setAiError(null)
    startAi(async () => {
      const res = await generateEmailDraft({
        purpose:       ai.purpose,
        language:      ai.language,
        objective:     aiObjective,
        tone:          aiTone,
        idea:          aiIdea,
        keyPoints:     aiPoints || undefined,
        length:        aiLength,
        agentName:     ai.agentName,
        tenantName:    ai.tenantName,
        leadFirstName: ai.leadFirstName,
      })
      if (!res.ok) { setAiError(res.error); return }
      onChange({ subject: res.draft.subject, body: res.draft.body })
      setAiOpen(false)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <style>{`.ec-input:focus { border-color: var(--border-accent) !important; }`}</style>

      {/* Generar con IA */}
      {ai && (
        <div>
          {!aiOpen ? (
            <button
              type="button"
              onClick={() => { setAiOpen(true); setAiError(null) }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', fontSize: '12px', fontWeight: 500,
                background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
                border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              <Sparkles size={13} />
              Generar con IA
            </button>
          ) : (
            <div style={{
              background: 'rgba(201,169,110,0.05)', border: '1px solid rgba(201,169,110,0.2)',
              borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={13} /> Generar contenido con IA
                </span>
                <button type="button" onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>

              <div>
                <label style={LABEL}>Objetivo del correo <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
                <input
                  value={aiObjective}
                  onChange={e => setAiObjective(e.target.value)}
                  placeholder="Ej.: reconectar con el lead, compartir un recurso, invitar a una llamada…"
                  className="ec-input"
                  style={INPUT}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={LABEL}>Tono</label>
                  <select value={aiTone} onChange={e => setAiTone(e.target.value)} className="ec-input" style={{ ...INPUT, cursor: 'pointer' }}>
                    {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: '0 0 140px' }}>
                  <label style={LABEL}>Extensión</label>
                  <select value={aiLength} onChange={e => setAiLength(e.target.value as 'short' | 'medium')} className="ec-input" style={{ ...INPUT, cursor: 'pointer' }}>
                    <option value="short">Corto</option>
                    <option value="medium">Medio</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={LABEL}>Idea general / qué quieres decir <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
                <textarea
                  value={aiIdea}
                  onChange={e => setAiIdea(e.target.value)}
                  rows={3}
                  placeholder="Explica en tus palabras el mensaje central del correo."
                  className="ec-input"
                  style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={LABEL}>Puntos a incluir (opcional)</label>
                <textarea
                  value={aiPoints}
                  onChange={e => setAiPoints(e.target.value)}
                  rows={2}
                  placeholder="Detalles concretos que no deben faltar (fechas, nombres, un enlace…)."
                  className="ec-input"
                  style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={aiBusy || !aiObjective.trim() || !aiIdea.trim()}
                  style={{
                    padding: '7px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                    cursor: aiBusy || !aiObjective.trim() || !aiIdea.trim() ? 'not-allowed' : 'pointer',
                    opacity: aiBusy || !aiObjective.trim() || !aiIdea.trim() ? 0.6 : 1,
                  }}
                >
                  {aiBusy ? 'Generando…' : 'Generar borrador'}
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  El borrador reemplaza el contenido actual — revísalo antes de guardar.
                </span>
              </div>
              {aiError && <div style={{ fontSize: '12px', color: 'var(--status-hot)' }}>{aiError}</div>}
            </div>
          )}
        </div>
      )}

      {/* Asunto */}
      <div>
        <label style={LABEL}>Asunto <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
        <input
          value={value.subject}
          onChange={e => set('subject', e.target.value)}
          placeholder="Hola {{customer_name}}"
          maxLength={200}
          className="ec-input"
          style={INPUT}
        />
      </div>

      {/* Merge tags */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Insertar variable:</span>
        {MERGE_TAGS.map(t => (
          <button
            key={t.tag}
            type="button"
            title={t.label}
            onClick={() => insertTag(t.tag)}
            style={{
              padding: '2px 8px', fontSize: '11px', fontFamily: 'monospace',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {t.tag}
          </button>
        ))}
      </div>

      {/* Cuerpo */}
      <div>
        <label style={LABEL}>Mensaje <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
        <textarea
          ref={bodyRef}
          value={value.body}
          onChange={e => set('body', e.target.value)}
          rows={10}
          maxLength={8000}
          placeholder={'Hola {{customer_name}},\n\nEscribe aquí tu mensaje como si le escribieras a un conocido…'}
          className="ec-input"
          style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, fontSize: '14px' }}
        />
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>
          Escríbelo en tono personal, como un correo normal. Deja una línea en blanco entre párrafos. La firma
          del agente y el enlace para cancelar suscripción se agregan automáticamente — la firma se configura en{' '}
          <strong style={{ color: 'var(--text-secondary)' }}>Configuración → Email</strong>.
        </div>
      </div>

      {/* Vista previa */}
      <div>
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewing}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: '8px',
            cursor: previewing ? 'wait' : 'pointer', opacity: previewing ? 0.7 : 1,
          }}
        >
          <Eye size={13} />
          {previewing ? 'Generando vista previa…' : 'Vista previa'}
        </button>
        {previewError && <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginTop: '8px' }}>{previewError}</div>}
        {previewHtml && (
          <div style={{ marginTop: '10px', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
            <iframe
              sandbox=""
              srcDoc={previewHtml}
              title="Vista previa del correo"
              style={{ width: '100%', height: '420px', border: 'none', display: 'block' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
