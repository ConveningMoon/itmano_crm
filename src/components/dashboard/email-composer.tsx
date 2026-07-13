'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, Sparkles, X } from 'lucide-react'
import type { EmailContent } from '@/lib/email-content'
import { EmailContentSchema, MERGE_TAGS, EMAIL_CONTENT_VERSION } from '@/lib/email-content'
import { previewEmailHtml } from '@/app/(dashboard)/emails/actions'
import { generateEmailDraft, type EmailAiPurpose } from '@/app/(dashboard)/emails/ai-actions'

// Composer estructurado de correos del CRM. Lo comparten tres superficies:
// pasos de secuencia (step-manager), correos de hitos de compra
// (purchase-templates-panel) y envío one-off desde el detalle del lead.
// El HTML final NUNCA se arma aquí — la vista previa y el envío usan el mismo
// renderer server-side (email-render.ts vía previewEmailHtml / send services).

// ─── Value model ──────────────────────────────────────────────────────────────

export interface ComposerValue {
  subject:          string
  paragraphs:       string[]
  ctaEnabled:       boolean
  ctaLabel:         string
  ctaUrl:           string
  includeSignature: boolean
}

export function emptyComposerValue(): ComposerValue {
  return { subject: '', paragraphs: [''], ctaEnabled: false, ctaLabel: '', ctaUrl: '', includeSignature: true }
}

// Reconstruye el estado del composer desde una fila de la DB (subject + body_json).
export function composerValueFrom(subject: string | null, bodyJson: unknown): ComposerValue {
  const parsed = EmailContentSchema.safeParse(bodyJson)
  if (!parsed.success) return { ...emptyComposerValue(), subject: subject ?? '' }
  const c = parsed.data
  return {
    subject:          subject ?? '',
    paragraphs:       c.paragraphs.length > 0 ? c.paragraphs : [''],
    ctaEnabled:       c.cta !== null,
    ctaLabel:         c.cta?.label ?? '',
    ctaUrl:           c.cta?.url ?? '',
    includeSignature: c.include_signature,
  }
}

// Convierte el estado del composer al payload de las actions. Devuelve un error
// legible si falta algo (la validación dura la repite el server con zod).
export function composerValueToInput(
  v: ComposerValue,
): { ok: true; subject: string; content: EmailContent } | { ok: false; error: string } {
  const subject = v.subject.trim()
  if (!subject) return { ok: false, error: 'El asunto es obligatorio' }

  const paragraphs = v.paragraphs.map(p => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return { ok: false, error: 'El correo necesita al menos un párrafo' }

  let cta: EmailContent['cta'] = null
  if (v.ctaEnabled) {
    if (!v.ctaLabel.trim()) return { ok: false, error: 'El botón necesita un texto' }
    if (!/^https?:\/\/\S+$/i.test(v.ctaUrl.trim())) return { ok: false, error: 'La URL del botón debe empezar con http:// o https://' }
    cta = { label: v.ctaLabel.trim(), url: v.ctaUrl.trim() }
  }

  const content: EmailContent = {
    v: EMAIL_CONTENT_VERSION,
    paragraphs,
    cta,
    include_signature: v.includeSignature,
  }
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

const ICON_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '24px', height: '24px', borderRadius: '6px',
  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0,
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface ComposerAiContext {
  purpose:        EmailAiPurpose
  language:       'es' | 'en' | 'pt'
  leadMagnetName?: string
  agentName?:      string
  tenantName?:     string
  leadFirstName?:  string
}

interface Props {
  value:    ComposerValue
  onChange: (v: ComposerValue) => void
  // Idioma del footer/preview (idioma de la secuencia / del template / del lead).
  locale?:  'es' | 'en' | 'pt'
  // super_admin: branding de un tenant específico en la vista previa.
  previewTenantId?: string
  // Contexto para "Generar con IA"; sin él, el botón no se muestra.
  ai?: ComposerAiContext
}

export function EmailComposer({ value, onChange, locale = 'es', previewTenantId, ai }: Props) {
  const [previewHtml, setPreviewHtml]   = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview]      = useTransition()

  const [aiOpen, setAiOpen]     = useState(false)
  const [aiBrief, setAiBrief]   = useState('')
  const [aiError, setAiError]   = useState<string | null>(null)
  const [aiBusy, startAi]       = useTransition()

  // Última posición de cursor conocida para insertar merge tags.
  const focusRef = useRef<{ field: 'subject' | number; pos: number } | null>(null)

  function set<K extends keyof ComposerValue>(key: K, val: ComposerValue[K]) {
    onChange({ ...value, [key]: val })
  }

  function setParagraph(idx: number, text: string) {
    const next = [...value.paragraphs]
    next[idx] = text
    set('paragraphs', next)
  }

  function addParagraph() {
    set('paragraphs', [...value.paragraphs, ''])
  }

  function removeParagraph(idx: number) {
    if (value.paragraphs.length <= 1) return
    set('paragraphs', value.paragraphs.filter((_, i) => i !== idx))
  }

  function moveParagraph(idx: number, dir: -1 | 1) {
    const to = idx + dir
    if (to < 0 || to >= value.paragraphs.length) return
    const next = [...value.paragraphs]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    set('paragraphs', next)
  }

  // Un solo handler estable (no una factory por-render) para no violar la regla
  // react-hooks/refs. El campo se lee del atributo data-field del elemento:
  // "subject" o "p:<índice>".
  const trackFocus = useCallback((e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const raw = el.dataset.field
    if (!raw) return
    const field: 'subject' | number = raw === 'subject' ? 'subject' : Number(raw.slice(2))
    focusRef.current = { field, pos: el.selectionStart ?? el.value.length }
  }, [])

  function insertTag(tag: string) {
    const focus = focusRef.current
    if (focus === null) {
      // Sin foco previo: al final del último párrafo.
      const idx = value.paragraphs.length - 1
      setParagraph(idx, value.paragraphs[idx] + tag)
      return
    }
    if (focus.field === 'subject') {
      const s = value.subject
      set('subject', s.slice(0, focus.pos) + tag + s.slice(focus.pos))
      focusRef.current = { field: 'subject', pos: focus.pos + tag.length }
    } else {
      const p = value.paragraphs[focus.field] ?? ''
      setParagraph(focus.field, p.slice(0, focus.pos) + tag + p.slice(focus.pos))
      focusRef.current = { field: focus.field, pos: focus.pos + tag.length }
    }
  }

  function handlePreview() {
    setPreviewError(null)
    const input = composerValueToInput(value)
    if (!input.ok) { setPreviewError(input.error); return }
    startPreview(async () => {
      const res = await previewEmailHtml({
        subject:  input.subject,
        content:  input.content,
        locale,
        tenantId: previewTenantId,
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
        purpose:        ai.purpose,
        language:       ai.language,
        brief:          aiBrief,
        leadMagnetName: ai.leadMagnetName,
        agentName:      ai.agentName,
        tenantName:     ai.tenantName,
        leadFirstName:  ai.leadFirstName,
      })
      if (!res.ok) { setAiError(res.error); return }
      const d = res.draft
      onChange({
        subject:          d.subject,
        paragraphs:       d.paragraphs.length > 0 ? d.paragraphs : [''],
        ctaEnabled:       d.cta !== null,
        ctaLabel:         d.cta?.label ?? '',
        ctaUrl:           d.cta?.url ?? '',
        includeSignature: d.include_signature,
      })
      setAiOpen(false)
      setAiBrief('')
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
              borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={13} /> Generar contenido con IA
                </span>
                <button type="button" onClick={() => setAiOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={aiBrief}
                onChange={e => setAiBrief(e.target.value)}
                rows={3}
                placeholder="Describe el correo: objetivo, qué debe comunicar, enlaces si aplica…"
                className="ec-input"
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={aiBusy || !aiBrief.trim()}
                  style={{
                    padding: '7px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                    cursor: aiBusy || !aiBrief.trim() ? 'not-allowed' : 'pointer',
                    opacity: aiBusy || !aiBrief.trim() ? 0.6 : 1,
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
          data-field="subject"
          value={value.subject}
          onChange={e => { set('subject', e.target.value); focusRef.current = { field: 'subject', pos: e.target.selectionStart ?? e.target.value.length } }}
          onFocus={trackFocus}
          onSelect={trackFocus}
          placeholder="Tu guía está lista, {{customer_name}}"
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

      {/* Párrafos */}
      <div>
        <label style={LABEL}>Contenido <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {value.paragraphs.map((p, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <textarea
                data-field={`p:${idx}`}
                value={p}
                onChange={e => { setParagraph(idx, e.target.value); focusRef.current = { field: idx, pos: e.target.selectionStart ?? e.target.value.length } }}
                onFocus={trackFocus}
                onSelect={trackFocus}
                rows={3}
                maxLength={2000}
                placeholder={idx === 0 ? 'Hola {{customer_name}}, …' : 'Siguiente párrafo…'}
                className="ec-input"
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button type="button" title="Subir" onClick={() => moveParagraph(idx, -1)} disabled={idx === 0}
                  style={{ ...ICON_BTN, opacity: idx === 0 ? 0.35 : 1, cursor: idx === 0 ? 'default' : 'pointer' }}>
                  <ArrowUp size={11} />
                </button>
                <button type="button" title="Bajar" onClick={() => moveParagraph(idx, 1)} disabled={idx === value.paragraphs.length - 1}
                  style={{ ...ICON_BTN, opacity: idx === value.paragraphs.length - 1 ? 0.35 : 1, cursor: idx === value.paragraphs.length - 1 ? 'default' : 'pointer' }}>
                  <ArrowDown size={11} />
                </button>
                <button type="button" title="Eliminar párrafo" onClick={() => removeParagraph(idx)} disabled={value.paragraphs.length <= 1}
                  style={{ ...ICON_BTN, color: 'var(--accent-coral)', opacity: value.paragraphs.length <= 1 ? 0.35 : 1, cursor: value.paragraphs.length <= 1 ? 'default' : 'pointer' }}>
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {value.paragraphs.length < 12 && (
          <button
            type="button"
            onClick={addParagraph}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '8px',
              padding: '5px 10px', fontSize: '11px',
              background: 'transparent', border: '1px dashed var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <Plus size={11} /> Agregar párrafo
          </button>
        )}
      </div>

      {/* CTA */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={value.ctaEnabled}
            onChange={e => set('ctaEnabled', e.target.checked)}
            style={{ accentColor: 'var(--accent-gold)' }}
          />
          Botón de acción (CTA)
        </label>
        {value.ctaEnabled && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <input
              value={value.ctaLabel}
              onChange={e => set('ctaLabel', e.target.value)}
              placeholder="Descargar guía"
              maxLength={80}
              className="ec-input"
              style={{ ...INPUT, flex: '1 1 160px' }}
            />
            <input
              value={value.ctaUrl}
              onChange={e => set('ctaUrl', e.target.value)}
              placeholder="https://…"
              className="ec-input"
              style={{ ...INPUT, flex: '2 1 220px', fontFamily: 'monospace', fontSize: '12px' }}
            />
          </div>
        )}
      </div>

      {/* Firma */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={value.includeSignature}
          onChange={e => set('includeSignature', e.target.checked)}
          style={{ accentColor: 'var(--accent-gold)' }}
        />
        Incluir firma del agente (nombre + email)
      </label>

      {/* Nota fija: unsubscribe automático */}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        El correo se envía con el branding del equipo y un enlace de cancelar suscripción
        automático en el pie — no hace falta agregarlo.
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
          <div style={{ marginTop: '10px', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', background: '#f2f2f0' }}>
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
