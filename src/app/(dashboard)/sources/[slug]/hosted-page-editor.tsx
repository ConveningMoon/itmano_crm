'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Globe, Plus, Trash2 } from 'lucide-react'
import { hostedChannelUrl, type HostedPageConfig, type HostedQuestion } from '@/lib/hosted-page'
import { updateHostedPage } from '../actions'

// Constructor de la página alojada del canal (migración 060). El tenant
// configura título, subtítulo, bullets, CTA y preguntas — ITMANO aloja la
// página en lm|events|forms.itmano.com/<tenant>/<canal>.

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
}
const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px', fontWeight: 500, color: 'var(--bg-base)',
  background: 'var(--accent-gold)', border: 'none', borderRadius: '8px', cursor: 'pointer',
}
const BTN_GHOST: React.CSSProperties = {
  padding: '7px 14px', fontSize: '12px', color: 'var(--text-muted)',
  background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
}

const EMPTY: HostedPageConfig = {
  enabled: false, language: 'es', headline: '', subheadline: '', bullets: [],
  cta_label: '', success_message: '', ask_phone: false, questions: [],
}

function slugifyKey(label: string, fallback: string): string {
  const s = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return s || fallback
}

export function HostedPageEditor({
  channelId, channelType, tenantSlug, channelSlug, initial, canEdit,
}: {
  channelId: string
  channelType: string
  tenantSlug: string
  channelSlug: string
  initial: HostedPageConfig | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [cfg, setCfg]         = useState<HostedPageConfig>(initial ?? EMPTY)
  const [error, setError]     = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)
  const [pending, start]      = useTransition()

  const isContact = channelType === 'contact_form'
  const url       = hostedChannelUrl(channelType, tenantSlug, channelSlug)
  const active    = !!initial?.enabled

  function set<K extends keyof HostedPageConfig>(key: K, value: HostedPageConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  function setQuestion(i: number, patch: Partial<HostedQuestion>) {
    setCfg(prev => ({
      ...prev,
      questions: prev.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q),
    }))
  }

  function handleSave(enabled: boolean) {
    setError(null)
    const normalized: HostedPageConfig = {
      ...cfg,
      enabled,
      questions: cfg.questions
        .filter(q => q.label.trim())
        .map((q, i) => ({
          ...q,
          key: slugifyKey(q.label, `pregunta_${i + 1}`),
          options: q.type === 'select'
            ? (q.options ?? []).map(o => o.trim()).filter(Boolean)
            : undefined,
        })),
    }
    start(async () => {
      const res = await updateHostedPage(channelId, normalized)
      if (!res.ok) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function copyUrl() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', marginBottom: '24px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Globe size={16} color="var(--accent-gold)" />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Página alojada
            <span style={{
              marginLeft: '10px', fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: active ? 'var(--accent-green)' : 'var(--text-muted)',
              background: active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
            }}>
              {active ? 'Activa' : initial ? 'Desactivada' : 'Sin configurar'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            ITMANO aloja la landing de este canal — sin sitio web propio ni configuración técnica.
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setOpen(v => !v); setCfg(initial ?? EMPTY); setError(null) }} style={BTN_GHOST}>
            {open ? 'Cerrar' : initial ? 'Editar página' : 'Configurar página'}
          </button>
        )}
      </div>

      {/* URL */}
      {active && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        }}>
          <code style={{ fontSize: '12px', color: 'var(--accent-gold)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>{url}</code>
          <button onClick={copyUrl} title="Copiar URL" style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}>
            {copied ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
            {copied ? 'Copiada' : 'Copiar'}
          </button>
          <a
            href={`/hp/${tenantSlug}/${channelSlug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', textDecoration: 'none' }}
          >
            <ExternalLink size={12} /> Ver página
          </a>
        </div>
      )}

      {/* Editor */}
      {open && canEdit && (
        <div style={{ padding: '20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div>
              <label style={LABEL}>Título de la página *</label>
              <input style={INPUT} value={cfg.headline} onChange={e => set('headline', e.target.value)} placeholder="Guía para comprar tu primera casa" />
            </div>
            <div>
              <label style={LABEL}>Idioma</label>
              <select style={{ ...INPUT, cursor: 'pointer' }} value={cfg.language} onChange={e => set('language', e.target.value as HostedPageConfig['language'])}>
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </div>
          </div>
          <div>
            <label style={LABEL}>Subtítulo</label>
            <input style={INPUT} value={cfg.subheadline} onChange={e => set('subheadline', e.target.value)} placeholder="Todo lo que necesitas saber, paso a paso." />
          </div>
          <div>
            <label style={LABEL}>Beneficios (uno por línea, máx. 6)</label>
            <textarea
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              rows={3}
              value={cfg.bullets.join('\n')}
              onChange={e => set('bullets', e.target.value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={LABEL}>Texto del botón</label>
              <input style={INPUT} value={cfg.cta_label} onChange={e => set('cta_label', e.target.value)} placeholder="Quiero la guía" />
            </div>
            <div>
              <label style={LABEL}>Mensaje de éxito</label>
              <input style={INPUT} value={cfg.success_message} onChange={e => set('success_message', e.target.value)} placeholder="¡Listo! Revisa tu correo." />
            </div>
          </div>

          {!isContact && (
            <>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.ask_phone} onChange={e => set('ask_phone', e.target.checked)} style={{ accentColor: 'var(--accent-gold)' }} />
                Pedir teléfono
              </label>

              {/* Preguntas */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ ...LABEL, marginBottom: 0 }}>Preguntas del formulario</label>
                  <button
                    onClick={() => set('questions', [...cfg.questions, { key: '', label: '', type: 'text', required: false }])}
                    style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                    disabled={cfg.questions.length >= 10}
                  >
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                {cfg.questions.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Sin preguntas extra — el formulario pide nombre y email{cfg.ask_phone ? ' y teléfono' : ''}.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {cfg.questions.map((q, i) => (
                    <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px auto', gap: '10px', alignItems: 'center' }}>
                        <input style={INPUT} value={q.label} onChange={e => setQuestion(i, { label: e.target.value })} placeholder="¿Cuál es tu horizonte de compra?" />
                        <select style={{ ...INPUT, cursor: 'pointer' }} value={q.type} onChange={e => setQuestion(i, { type: e.target.value as HostedQuestion['type'] })}>
                          <option value="text">Texto</option>
                          <option value="select">Opciones</option>
                        </select>
                        <button onClick={() => set('questions', cfg.questions.filter((_, idx) => idx !== i))} title="Quitar" style={{ ...BTN_GHOST, padding: '6px 8px' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {q.type === 'select' && (
                        <input
                          style={INPUT}
                          value={(q.options ?? []).join(', ')}
                          onChange={e => setQuestion(i, { options: e.target.value.split(',').map(o => o.trim()) })}
                          placeholder="Opciones separadas por coma: Menos de 3 meses, 3–6 meses, Más de 6 meses"
                        />
                      )}
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={q.required} onChange={e => setQuestion(i, { required: e.target.checked })} style={{ accentColor: 'var(--accent-gold)' }} />
                        Obligatoria
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <div style={{ fontSize: '12px', color: '#E04040' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => handleSave(true)} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : 'Guardar y publicar'}
            </button>
            {active && (
              <button onClick={() => handleSave(false)} disabled={pending} style={BTN_GHOST}>
                Guardar desactivada
              </button>
            )}
            <button onClick={() => { setOpen(false); setError(null) }} style={BTN_GHOST}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
