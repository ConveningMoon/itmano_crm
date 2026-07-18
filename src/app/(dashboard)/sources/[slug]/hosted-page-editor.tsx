'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, ExternalLink, Globe, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { hostedChannelUrl, HostedPageConfigSchema, type HostedPageConfig, type HostedQuestion } from '@/lib/hosted-page'
import { generateHostedPageCopy, updateHostedPage, uploadHostedImage } from '../actions'

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
  cover_image_url: '', benefits: [],
  agent_intro: { name: '', title: '', paragraph: '', photo_url: '' },
}

function slugifyKey(label: string, fallback: string): string {
  const s = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return s || fallback
}

export function HostedPageEditor({
  channelId, channelType, tenantSlug, channelSlug, initial, canEdit, tenantName, agentName,
}: {
  channelId: string
  channelType: string
  tenantSlug: string
  channelSlug: string
  initial: HostedPageConfig | null
  canEdit: boolean
  tenantName?: string
  agentName?: string | null
}) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [cfg, setCfg]         = useState<HostedPageConfig>(initial ?? EMPTY)
  const [error, setError]     = useState<string | null>(null)
  const [copied, setCopied]   = useState(false)
  const [pending, start]      = useTransition()

  // IA + JSON + imágenes
  const [aiDesc, setAiDesc]     = useState('')
  const [aiBusy, setAiBusy]     = useState(false)
  const [aiDoc, setAiDoc]       = useState<File | null>(null)
  const aiDocInputRef           = useRef<HTMLInputElement>(null)
  const jsonInputRef            = useRef<HTMLInputElement>(null)
  const coverInputRef           = useRef<HTMLInputElement>(null)
  const photoInputRef           = useRef<HTMLInputElement>(null)
  const [imgBusy, setImgBusy]   = useState<'cover' | 'photo' | null>(null)

  const isContact = channelType === 'contact_form'
  const url       = hostedChannelUrl(channelType, tenantSlug, channelSlug)
  const active    = !!initial?.enabled
  const hasDraft  = !!initial && !initial.enabled

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
      benefits: cfg.benefits
        .map(b => ({ title: b.title.trim(), desc: (b.desc ?? '').trim() }))
        .filter(b => b.title),
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

  // ── IA: rellenar textos desde una descripción (+ documento opcional) ─────────
  function handleAiFill() {
    setError(null)
    if (!aiDesc.trim()) { setError('La descripción es obligatoria para generar con IA.'); return }
    setAiBusy(true)
    const run = (documentBase64?: string) => generateHostedPageCopy({
      channelType,
      language: cfg.language,
      description: aiDesc,
      tenantName,
      agentName: agentName ?? undefined,
      documentBase64,
    }).then(res => {
      setAiBusy(false)
      if (!res.ok) { setError(res.error); return }
      setCfg(prev => ({
        ...prev,
        headline:        res.copy.headline || prev.headline,
        subheadline:     res.copy.subheadline || prev.subheadline,
        bullets:         res.copy.bullets.length ? res.copy.bullets : prev.bullets,
        cta_label:       res.copy.cta_label || prev.cta_label,
        success_message: res.copy.success_message || prev.success_message,
        benefits:        res.copy.benefits.length ? res.copy.benefits : prev.benefits,
      }))
    }).catch(() => { setAiBusy(false); setError('No se pudo generar el copy.') })

    if (aiDoc) {
      // PDF → base64 (sin el prefijo data:) para el bloque document de la IA.
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result)
        const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result
        run(base64)
      }
      reader.onerror = () => { setAiBusy(false); setError('No se pudo leer el documento.') }
      reader.readAsDataURL(aiDoc)
    } else {
      run()
    }
  }

  // ── JSON: descargar template / subir template completado ────────────────────
  function handleDownloadJson() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pagina-${channelSlug}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleUploadJson(file: File | null) {
    if (!file) return
    setError(null)
    file.text().then(text => {
      let raw: unknown
      try { raw = JSON.parse(text) } catch { setError('El archivo no es un JSON válido.'); return }
      // Merge sobre el estado actual y valida con el schema completo.
      const merged = { ...cfg, ...(raw as Record<string, unknown>) }
      const parsed = HostedPageConfigSchema.safeParse(merged)
      if (!parsed.success) {
        setError(`JSON inválido: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`)
        return
      }
      setCfg(parsed.data)
    })
  }

  // ── Imágenes (portada / foto del agente) ────────────────────────────────────
  function handleImageUpload(kind: 'cover' | 'photo', file: File | null) {
    if (!file) return
    setError(null)
    setImgBusy(kind)
    const fd = new FormData()
    fd.set('file', file)
    uploadHostedImage(fd).then(res => {
      setImgBusy(null)
      if (!res.ok) { setError(res.error); return }
      if (kind === 'cover') set('cover_image_url', res.url)
      else setCfg(prev => ({ ...prev, agent_intro: { ...(prev.agent_intro ?? { name: '', title: '', paragraph: '', photo_url: '' }), photo_url: res.url } }))
    }).catch(() => { setImgBusy(null); setError('No se pudo subir la imagen.') })
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

      {/* Borrador guardado (sin publicar) */}
      {hasDraft && !open && (
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hay un borrador guardado sin publicar.</span>
          <a href={`/hp/${tenantSlug}/${channelSlug}?draft=1`} target="_blank" rel="noopener noreferrer"
            style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', textDecoration: 'none' }}>
            <ExternalLink size={12} /> Ver borrador
          </a>
        </div>
      )}

      {/* Editor */}
      {open && canEdit && (
        <div style={{ padding: '20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* IA + JSON */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              <Sparkles size={14} color="var(--accent-gold)" /> Generar los textos con IA
            </div>
            <textarea
              rows={3}
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              placeholder="Describe el material o el objetivo (ej.: guía en español para familias hispanas que compran su primera casa en Hampton Roads; incluye préstamos ITIN y programas de ayuda de Virginia)…"
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={handleAiFill} disabled={aiBusy} style={{ ...BTN_PRIMARY, opacity: aiBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={13} /> {aiBusy ? 'Generando…' : 'Rellenar con IA'}
              </button>
              <button onClick={handleDownloadJson} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Download size={12} /> Descargar JSON
              </button>
              <button onClick={() => jsonInputRef.current?.click()} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Upload size={12} /> Subir JSON
              </button>
              <input ref={jsonInputRef} type="file" accept="application/json,.json" hidden onChange={e => { handleUploadJson(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </div>
            {/* Documento opcional para la IA (PDF) */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => aiDocInputRef.current?.click()} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Upload size={12} /> {aiDoc ? 'Cambiar documento' : 'Adjuntar documento (PDF)'}
              </button>
              {aiDoc && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {aiDoc.name}
                  <button onClick={() => setAiDoc(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex' }} title="Quitar"><X size={12} /></button>
                </span>
              )}
              <input ref={aiDocInputRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 10 * 1024 * 1024) { setError('El documento supera 10 MB.'); } else { setAiDoc(f ?? null) } e.target.value = '' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              La descripción es obligatoria. Opcional: adjunta un PDF (folleto, ficha, guía) y la IA lo usa como
              fuente. También puedes descargar el JSON, completarlo con tu modelo de confianza y subirlo. Las imágenes se suben a mano.
            </div>
          </div>
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

          {/* Imágenes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={LABEL}>Portada del material (imagen)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {cfg.cover_image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cfg.cover_image_url} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
                )}
                <button onClick={() => coverInputRef.current?.click()} disabled={imgBusy === 'cover'} style={BTN_GHOST}>
                  {imgBusy === 'cover' ? 'Subiendo…' : cfg.cover_image_url ? 'Cambiar' : 'Subir imagen'}
                </button>
                {cfg.cover_image_url && (
                  <button onClick={() => set('cover_image_url', '')} style={BTN_GHOST}>Quitar</button>
                )}
                <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { handleImageUpload('cover', e.target.files?.[0] ?? null); e.target.value = '' }} />
              </div>
            </div>
            <div>
              <label style={LABEL}>Foto del agente (sección &quot;quién lo preparó&quot;)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {cfg.agent_intro?.photo_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cfg.agent_intro.photo_url} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--border-subtle)' }} />
                )}
                <button onClick={() => photoInputRef.current?.click()} disabled={imgBusy === 'photo'} style={BTN_GHOST}>
                  {imgBusy === 'photo' ? 'Subiendo…' : cfg.agent_intro?.photo_url ? 'Cambiar' : 'Subir foto'}
                </button>
                <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { handleImageUpload('photo', e.target.files?.[0] ?? null); e.target.value = '' }} />
              </div>
            </div>
          </div>

          {/* Beneficios (tarjetas) */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ ...LABEL, marginBottom: 0 }}>Tarjetas de beneficios (&quot;qué contiene&quot;)</label>
              <button
                onClick={() => set('benefits', [...cfg.benefits, { title: '', desc: '' }])}
                style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                disabled={cfg.benefits.length >= 6}
              >
                <Plus size={12} /> Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cfg.benefits.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '10px', alignItems: 'center' }}>
                  <input style={INPUT} value={b.title} placeholder="Título" onChange={e => set('benefits', cfg.benefits.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} />
                  <input style={INPUT} value={b.desc} placeholder="Descripción corta" onChange={e => set('benefits', cfg.benefits.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x))} />
                  <button onClick={() => set('benefits', cfg.benefits.filter((_, idx) => idx !== i))} title="Quitar" style={{ ...BTN_GHOST, padding: '6px 8px' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quién lo preparó */}
          <div>
            <label style={LABEL}>Quién lo preparó (opcional)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input style={INPUT} value={cfg.agent_intro?.name ?? ''} placeholder="Nombre del agente"
                onChange={e => setCfg(p => ({ ...p, agent_intro: { ...(p.agent_intro ?? { name: '', title: '', paragraph: '', photo_url: '' }), name: e.target.value } }))} />
              <input style={INPUT} value={cfg.agent_intro?.title ?? ''} placeholder="Título (ej.: Asesora bilingüe · A&J)"
                onChange={e => setCfg(p => ({ ...p, agent_intro: { ...(p.agent_intro ?? { name: '', title: '', paragraph: '', photo_url: '' }), title: e.target.value } }))} />
            </div>
            <textarea
              rows={2}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginTop: '10px' }}
              value={cfg.agent_intro?.paragraph ?? ''}
              placeholder="Párrafo de presentación personal…"
              onChange={e => setCfg(p => ({ ...p, agent_intro: { ...(p.agent_intro ?? { name: '', title: '', paragraph: '', photo_url: '' }), paragraph: e.target.value } }))}
            />
          </div>

          {/* Preguntas personalizadas — disponibles para todos los tipos: los
              formularios y eventos pueden tener preguntas propias; el lead magnet
              las usa como calificación para el scoring. */}
          {(
            <>
              {!isContact && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={cfg.ask_phone} onChange={e => set('ask_phone', e.target.checked)} style={{ accentColor: 'var(--accent-gold)' }} />
                  Pedir teléfono
                </label>
              )}

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

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => handleSave(true)} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : 'Guardar y publicar'}
            </button>
            <button onClick={() => handleSave(false)} disabled={pending} style={BTN_GHOST}>
              {active ? 'Guardar despublicada' : 'Guardar borrador'}
            </button>
            <button onClick={() => { setOpen(false); setError(null) }} style={BTN_GHOST}>Cancelar</button>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              El borrador se previsualiza con &quot;Ver borrador&quot; antes de publicar.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
