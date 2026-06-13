'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader } from 'lucide-react'
import type { PurchaseTemplateRow } from './purchase-templates-actions'
import { updatePurchaseTemplate } from './purchase-templates-actions'

const MILESTONE_LABEL: Record<string, string> = {
  start:     'Inicio de proceso',
  pre_close: 'Pre-cierre (día antes)',
  completed: 'Proceso completado',
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

function TemplateCell({
  row,
  readOnly,
}: {
  row: PurchaseTemplateRow
  readOnly: boolean
}) {
  const [value,   setValue]   = useState(row.resend_template_id)
  const [status,  setStatus]  = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errMsg,  setErrMsg]  = useState('')

  const dirty      = value !== row.resend_template_id
  const placeholder = isPlaceholder(value)

  async function handleSave() {
    if (!dirty || readOnly) return
    setStatus('saving'); setErrMsg('')
    const res = await updatePurchaseTemplate(row.id, value)
    if (res.ok) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('error'); setErrMsg(res.error)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {placeholder && (
        <AlertTriangle size={13} color="var(--accent-coral)" style={{ flexShrink: 0 }} />
      )}
      {readOnly ? (
        <span style={{ fontSize: '12px', color: placeholder ? 'var(--accent-coral)' : 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {value || '—'}
        </span>
      ) : (
        <>
          <input
            value={value}
            onChange={e => { setValue(e.target.value); setStatus('idle') }}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
            placeholder="resend_template_id"
            style={{
              flex: 1,
              background: 'var(--bg-overlay)',
              border: `1px solid ${dirty ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '12px',
              fontFamily: 'monospace',
              color: placeholder ? 'var(--accent-coral)' : 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <div style={{ width: '18px', flexShrink: 0 }}>
            {status === 'saving' && <Loader size={13} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />}
            {status === 'saved'  && <Check  size={13} color="var(--accent-green)" />}
            {status === 'error'  && <span title={errMsg}><AlertTriangle size={13} color="var(--accent-coral)" /></span>}
          </div>
        </>
      )}
    </div>
  )
}

export function PurchaseTemplatesPanel({
  templates,
  readOnly = false,
}: {
  templates: PurchaseTemplateRow[]
  readOnly?: boolean
}) {
  const byKey = Object.fromEntries(templates.map(t => [`${t.milestone}_${t.language}`, t]))
  const langs = ['es', 'en', 'pt'] as const

  const pendingCount = templates.filter(t => isPlaceholder(t.resend_template_id)).length

  return (
    <div style={{ marginTop: '32px' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Emails de cierre
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Plantillas Resend para los hitos del proceso de compra (inicio, pre-cierre, completado).
          </p>
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
          display: 'grid', gridTemplateColumns: '180px repeat(3, 1fr)',
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
              display: 'grid', gridTemplateColumns: '180px repeat(3, 1fr)',
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
              return <TemplateCell key={lang} row={row} readOnly={readOnly} />
            })}
          </div>
        ))}
      </div>

      {!readOnly && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Edita directamente la celda y presiona Enter o haz clic fuera para guardar. Los IDs marcados con
          {' '}<AlertTriangle size={11} color="var(--accent-coral)" style={{ verticalAlign: 'middle' }} />{' '}
          aún no están configurados — los emails de ese idioma no se enviarán hasta que se reemplacen.
        </p>
      )}
    </div>
  )
}
