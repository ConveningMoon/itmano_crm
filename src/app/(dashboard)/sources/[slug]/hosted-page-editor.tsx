'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, ExternalLink, Globe, Plus, Quote, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { hostedChannelUrl, HostedPageConfigSchema, type HostedPageConfig, type HostedQuestion, type HostedTestimonial } from '@/lib/hosted-page'
import { generateHostedPageCopy, updateHostedPage, uploadHostedImage } from '../actions'

// Constructor de la página alojada del canal. Secciones según el tipo:
//   contact_form → copy base + preguntas
//   event        → copy base + datos del evento (fecha/lugar/hora) + preguntas
//   lead_magnet  → template completo (hero, beneficios, agente, testimonios, CTA final)
// El idioma ya no se elige: lo detecta la IA desde la descripción (default 'es').

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
  badge: '', microcopy: '', cover_image_url: '', background_image_url: '',
  benefits_title: '', benefits_subtitle: '', benefits: [],
  form_title: '', form_subtitle: '',
  agent_intro: { name: '', title: '', paragraph: '', quote: '', photo_url: '', whatsapp_url: '', instagram_url: '' },
  testimonials_title: '', testimonials: [],
  final_cta_title: '', final_cta_paragraph: '',
  event: { date: '', time: '', location: '', short_description: '' },
}

const EMPTY_INTRO = { name: '', title: '', paragraph: '', quote: '', photo_url: '', whatsapp_url: '', instagram_url: '' }

// Preguntas de calificación por defecto (lead magnet). Alimentan el análisis de
// fit: la IA las interpreta con el contexto de mercado de la agencia. Los rangos
// de presupuesto y las zonas son editables — ajústalos a tu mercado. Los puntos
// de cada nivel se afinan en Ajustes → Scoring.
const DEFAULT_LM_QUESTIONS: HostedQuestion[] = [
  { key: '', label: '¿Cuál es tu horizonte de compra?', type: 'select', required: true,
    options: ['Menos de 3 meses', '3 a 6 meses', '6 a 12 meses', 'Más de 12 meses / explorando'] },
  { key: '', label: '¿Cómo planeas financiar la compra?', type: 'select', required: false,
    options: ['Pago en efectivo', 'Pre-aprobado', 'En proceso de financiamiento', 'Aún no he empezado'] },
  { key: '', label: '¿Cuál es tu presupuesto aproximado?', type: 'select', required: false,
    options: ['Menos de $250k', '$250k – $400k', '$400k – $600k', 'Más de $600k'] },
  { key: '', label: '¿Ya trabajas con un agente inmobiliario?', type: 'select', required: false,
    options: ['No', 'Sí'] },
  { key: '', label: '¿Qué zonas te interesan?', type: 'text', required: false },
]

// Etiquetas de las preguntas por defecto — para marcarlas en el constructor.
const DEFAULT_LM_LABELS = new Set(DEFAULT_LM_QUESTIONS.map(q => q.label))

function slugifyKey(label: string, fallback: string): string {
  const s = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return s || fallback
}

// Encabezado de sección del editor.
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        {hint && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
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
  // Texto libre de los bullets (uno por línea) — se parsea al guardar, para que
  // escribir espacios y saltos de línea funcione con normalidad.
  const [bulletsText, setBulletsText] = useState((initial?.bullets ?? []).join('\n'))
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
  const bgInputRef              = useRef<HTMLInputElement>(null)
  const photoInputRef           = useRef<HTMLInputElement>(null)
  const testiInputRef           = useRef<HTMLInputElement>(null)
  const [testiUploadIdx, setTestiUploadIdx] = useState<number | null>(null)
  const [imgBusy, setImgBusy]   = useState<'cover' | 'background' | 'photo' | 'testimonial' | null>(null)

  const isContact = channelType === 'contact_form'
  const isEvent   = channelType === 'event'
  const isLm      = channelType === 'lead_magnet'
  const url       = hostedChannelUrl(channelType, tenantSlug, channelSlug)
  const active    = !!initial?.enabled
  const hasDraft  = !!initial && !initial.enabled

  function openEditor() {
    const base = initial ?? EMPTY
    // Lead magnet: las preguntas de calificación vienen CARGADAS por defecto la
    // primera vez (alimentan el scoring de fit). El usuario puede editarlas,
    // quitarlas o agregar las suyas.
    const questions = (channelType === 'lead_magnet' && (base.questions?.length ?? 0) === 0)
      ? DEFAULT_LM_QUESTIONS.map(q => ({ ...q }))
      : base.questions
    setCfg({
      ...EMPTY, ...base,
      questions,
      agent_intro: { ...EMPTY_INTRO, ...(base.agent_intro ?? {}) },
      event: { ...EMPTY.event!, ...(base.event ?? {}) },
    })
    setBulletsText((base.bullets ?? []).join('\n'))
    setError(null)
  }

  function set<K extends keyof HostedPageConfig>(key: K, value: HostedPageConfig[K]) {
    setCfg(prev => ({ ...prev, [key]: value }))
  }

  function setIntro(patch: Partial<NonNullable<HostedPageConfig['agent_intro']>>) {
    setCfg(prev => ({ ...prev, agent_intro: { ...EMPTY_INTRO, ...(prev.agent_intro ?? {}), ...patch } }))
  }

  function setEvent(patch: Partial<NonNullable<HostedPageConfig['event']>>) {
    setCfg(prev => ({ ...prev, event: { ...EMPTY.event!, ...(prev.event ?? {}), ...patch } }))
  }

  function setQuestion(i: number, patch: Partial<HostedQuestion>) {
    setCfg(prev => ({
      ...prev,
      questions: prev.questions.map((q, idx) => idx === i ? { ...q, ...patch } : q),
    }))
  }

  function setTestimonial(i: number, patch: Partial<HostedTestimonial>) {
    setCfg(prev => ({
      ...prev,
      testimonials: prev.testimonials.map((t, idx) => idx === i ? { ...t, ...patch } : t),
    }))
  }

  function handleSave(enabled: boolean) {
    setError(null)
    const normalized: HostedPageConfig = {
      ...cfg,
      enabled,
      bullets: bulletsText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6),
      benefits: cfg.benefits
        .map(b => ({ title: b.title.trim(), desc: (b.desc ?? '').trim() }))
        .filter(b => b.title),
      testimonials: cfg.testimonials
        .map(t => ({ name: t.name.trim(), location: (t.location ?? '').trim(), quote: t.quote.trim(), photo_url: (t.photo_url ?? '').trim() }))
        .filter(t => t.name && t.quote),
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
      description: aiDesc,
      tenantName,
      agentName: agentName ?? undefined,
      documentBase64,
    }).then(res => {
      setAiBusy(false)
      if (!res.ok) { setError(res.error); return }
      const c = res.copy
      setCfg(prev => ({
        ...prev,
        language:        c.language || prev.language,
        headline:        c.headline || prev.headline,
        subheadline:     c.subheadline || prev.subheadline,
        cta_label:       c.cta_label || prev.cta_label,
        success_message: c.success_message || prev.success_message,
        benefits:        c.benefits.length ? c.benefits : prev.benefits,
        badge:               c.badge || prev.badge,
        microcopy:           c.microcopy || prev.microcopy,
        benefits_title:      c.benefits_title || prev.benefits_title,
        benefits_subtitle:   c.benefits_subtitle || prev.benefits_subtitle,
        form_title:          c.form_title || prev.form_title,
        form_subtitle:       c.form_subtitle || prev.form_subtitle,
        final_cta_title:     c.final_cta_title || prev.final_cta_title,
        final_cta_paragraph: c.final_cta_paragraph || prev.final_cta_paragraph,
        event: {
          ...EMPTY.event!,
          ...(prev.event ?? {}),
          ...(c.event.date ? { date: c.event.date } : {}),
          ...(c.event.time ? { time: c.event.time } : {}),
          ...(c.event.location ? { location: c.event.location } : {}),
          ...(c.event.short_description ? { short_description: c.event.short_description } : {}),
        },
      }))
      if (c.bullets.length) setBulletsText(c.bullets.join('\n'))
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
    const blob = new Blob([JSON.stringify({ ...cfg, bullets: bulletsText.split('\n').map(l => l.trim()).filter(Boolean) }, null, 2)], { type: 'application/json' })
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
      setBulletsText((parsed.data.bullets ?? []).join('\n'))
    })
  }

  // ── Imágenes (portada / foto del agente / foto de testimonio) ───────────────
  function handleImageUpload(kind: 'cover' | 'background' | 'photo' | 'testimonial', file: File | null, testimonialIdx?: number) {
    if (!file) return
    setError(null)
    setImgBusy(kind)
    const fd = new FormData()
    fd.set('file', file)
    uploadHostedImage(fd).then(res => {
      setImgBusy(null)
      if (!res.ok) { setError(res.error); return }
      if (kind === 'cover') set('cover_image_url', res.url)
      else if (kind === 'background') set('background_image_url', res.url)
      else if (kind === 'photo') setIntro({ photo_url: res.url })
      else if (typeof testimonialIdx === 'number') setTestimonial(testimonialIdx, { photo_url: res.url })
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
          <button onClick={() => { setOpen(v => !v); openEditor() }} style={BTN_GHOST}>
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
        <div style={{ padding: '20px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* IA + JSON */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              <Sparkles size={14} color="var(--accent-gold)" /> Generar los textos con IA
            </div>
            <textarea
              rows={3}
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              placeholder={isEvent
                ? 'Describe el evento: qué es, para quién, fecha, hora y lugar (ej.: seminario gratuito para compradores primerizos, sábado 12 de octubre 10 AM, oficina de Virginia Beach)…'
                : 'Describe el material o el objetivo (ej.: guía en español para familias hispanas que compran su primera casa en Hampton Roads; incluye préstamos ITIN y programas de ayuda de Virginia)…'}
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
              <input ref={aiDocInputRef} type="file" accept="application/pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 10 * 1024 * 1024) { setError('El documento supera 10 MB.') } else { setAiDoc(f ?? null) } e.target.value = '' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              La descripción es obligatoria — la IA escribe en el idioma en que la redactes. Opcional: adjunta un PDF
              (folleto, ficha, guía) como fuente. También puedes descargar el JSON, completarlo con tu modelo de
              confianza y subirlo. Las imágenes y los testimonios se agregan a mano.
            </div>
          </div>

          {/* ── Encabezado ─────────────────────────────────────────────────── */}
          <Section title="Encabezado" hint={isLm ? 'Lo primero que se ve: etiqueta, título y subtítulo sobre la portada.' : undefined}>
            {isLm && (
              <div>
                <label style={LABEL}>Etiqueta superior (badge)</label>
                <input style={INPUT} value={cfg.badge} onChange={e => set('badge', e.target.value)} placeholder="Guía gratuita · Hampton Roads, Virginia" />
              </div>
            )}
            <div>
              <label style={LABEL}>Título de la página *</label>
              <input style={INPUT} value={cfg.headline} onChange={e => set('headline', e.target.value)} placeholder={isEvent ? 'Seminario para compradores primerizos' : 'Guía para comprar tu primera casa'} />
            </div>
            <div>
              <label style={LABEL}>Subtítulo</label>
              <input style={INPUT} value={cfg.subheadline} onChange={e => set('subheadline', e.target.value)} placeholder="Todo lo que necesitas saber, paso a paso." />
            </div>
            <div>
              <label style={LABEL}>Puntos clave (uno por línea, máx. 6)</label>
              <textarea
                style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                rows={4}
                value={bulletsText}
                onChange={e => setBulletsText(e.target.value)}
                placeholder={'Cómo comprar aunque no tengas número de seguro social\nProgramas de ayuda para el enganche\nLas mejores zonas para tu familia'}
              />
            </div>
            {/* Portada del material (solo lead magnet) — la imagen de la guía/PDF */}
            {isLm && (
              <div>
                <label style={LABEL}>Portada del material</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {cfg.cover_image_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={cfg.cover_image_url} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
                  )}
                  <button onClick={() => coverInputRef.current?.click()} disabled={imgBusy === 'cover'} style={BTN_GHOST}>
                    {imgBusy === 'cover' ? 'Subiendo…' : cfg.cover_image_url ? 'Cambiar' : 'Subir portada'}
                  </button>
                  {cfg.cover_image_url && (
                    <button onClick={() => set('cover_image_url', '')} style={BTN_GHOST}>Quitar</button>
                  )}
                  <input ref={coverInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { handleImageUpload('cover', e.target.files?.[0] ?? null); e.target.value = '' }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                  La imagen del material (guía/PDF). Se muestra flotando junto al título.
                </div>
              </div>
            )}

            {/* Imagen de fondo de la página — independiente de la portada */}
            <div>
              <label style={LABEL}>Imagen de fondo de la página</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {cfg.background_image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cfg.background_image_url} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
                )}
                <button onClick={() => bgInputRef.current?.click()} disabled={imgBusy === 'background'} style={BTN_GHOST}>
                  {imgBusy === 'background' ? 'Subiendo…' : cfg.background_image_url ? 'Cambiar' : 'Subir fondo'}
                </button>
                {cfg.background_image_url && (
                  <button onClick={() => set('background_image_url', '')} style={BTN_GHOST}>Quitar</button>
                )}
                <input ref={bgInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { handleImageUpload('background', e.target.files?.[0] ?? null); e.target.value = '' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                Cubre el encabezado de la página a todo lo ancho{isLm ? ' (si no la subes, se usa la portada)' : ''}.
              </div>
            </div>
          </Section>

          {/* ── Datos del evento ───────────────────────────────────────────── */}
          {isEvent && (
            <Section title="Datos del evento" hint="Se muestran con iconos bajo el título — fecha, hora y lugar.">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                <div>
                  <label style={LABEL}>Fecha</label>
                  <input style={INPUT} value={cfg.event?.date ?? ''} onChange={e => setEvent({ date: e.target.value })} placeholder="Sábado 12 de octubre" />
                </div>
                <div>
                  <label style={LABEL}>Hora</label>
                  <input style={INPUT} value={cfg.event?.time ?? ''} onChange={e => setEvent({ time: e.target.value })} placeholder="10:00 AM" />
                </div>
                <div>
                  <label style={LABEL}>Lugar</label>
                  <input style={INPUT} value={cfg.event?.location ?? ''} onChange={e => setEvent({ location: e.target.value })} placeholder="Oficina A&J · Virginia Beach" />
                </div>
              </div>
              <div>
                <label style={LABEL}>Descripción corta</label>
                <textarea
                  rows={3}
                  style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                  value={cfg.event?.short_description ?? ''}
                  onChange={e => setEvent({ short_description: e.target.value })}
                  placeholder="Qué verá el asistente, para quién es y qué se lleva…"
                />
              </div>
            </Section>
          )}

          {/* ── Sección "qué contiene" (lead magnet) / tarjetas (otros) ─────── */}
          {(isLm || !isEvent) && (
            <Section
              title={isLm ? 'Qué contiene' : 'Tarjetas de beneficios'}
              hint={isLm ? 'La sección de tarjetas bajo el hero — qué obtiene quien descarga el material.' : 'Opcional — tarjetas breves bajo el encabezado.'}
            >
              {isLm && (
                <>
                  <div>
                    <label style={LABEL}>Título de la sección</label>
                    <input style={INPUT} value={cfg.benefits_title} onChange={e => set('benefits_title', e.target.value)} placeholder="Todo lo que nadie te explica, paso a paso" />
                  </div>
                  <div>
                    <label style={LABEL}>Subtítulo de la sección</label>
                    <textarea rows={2} style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} value={cfg.benefits_subtitle} onChange={e => set('benefits_subtitle', e.target.value)} placeholder="Preparada por tu agente con base en años acompañando familias…" />
                  </div>
                </>
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ ...LABEL, marginBottom: 0 }}>Tarjetas (máx. 6)</label>
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
            </Section>
          )}

          {/* ── Formulario ─────────────────────────────────────────────────── */}
          <Section title="Formulario" hint="El botón, el mensaje de éxito y las preguntas que responde el visitante.">
            {isLm && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL}>Encabezado del formulario</label>
                  <input style={INPUT} value={cfg.form_title} onChange={e => set('form_title', e.target.value)} placeholder="Cuéntanos un poco sobre ti y recibe la guía" />
                </div>
                <div>
                  <label style={LABEL}>Frase de apoyo</label>
                  <input style={INPUT} value={cfg.form_subtitle} onChange={e => set('form_subtitle', e.target.value)} placeholder="Toma menos de 2 minutos." />
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={LABEL}>Texto del botón</label>
                <input style={INPUT} value={cfg.cta_label} onChange={e => set('cta_label', e.target.value)} placeholder={isEvent ? 'Reservar mi lugar' : 'Quiero la guía'} />
              </div>
              <div>
                <label style={LABEL}>Mensaje de éxito</label>
                <input style={INPUT} value={cfg.success_message} onChange={e => set('success_message', e.target.value)} placeholder="¡Listo! Revisa tu correo." />
              </div>
            </div>
            {isLm && (
              <div>
                <label style={LABEL}>Microcopy bajo el botón</label>
                <input style={INPUT} value={cfg.microcopy} onChange={e => set('microcopy', e.target.value)} placeholder="100% gratis · Sin compromiso" />
              </div>
            )}
            {!isContact && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={cfg.ask_phone} onChange={e => set('ask_phone', e.target.checked)} style={{ accentColor: 'var(--accent-gold)' }} />
                Pedir teléfono
              </label>
            )}

            {/* Preguntas — disponibles para todos los tipos */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ ...LABEL, marginBottom: 0 }}>Preguntas del formulario</label>
                <button
                  onClick={() => set('questions', [...cfg.questions, { key: '', label: '', type: 'text', required: false }])}
                  style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                  disabled={cfg.questions.length >= 10}
                >
                  <Plus size={12} /> Agregar pregunta
                </button>
              </div>
              {isLm && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '10px',
                  padding: '10px 12px', borderRadius: '8px',
                  background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.25)',
                }}>
                  <Sparkles size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Las preguntas marcadas como <strong style={{ color: 'var(--accent-gold)' }}>por defecto</strong> vienen
                    cargadas porque son las que <strong style={{ color: 'var(--text-primary)' }}>califican al lead</strong>:
                    horizonte de compra, financiamiento, presupuesto, si ya trabaja con otro agente y zonas de interés.
                    De ahí sale su <strong style={{ color: 'var(--text-primary)' }}>score de fit</strong> (qué tan buen
                    prospecto es), y con el análisis con IA activado se interpretan según el mercado de tu agencia —
                    por eso el mismo presupuesto puede valer distinto en dos mercados.
                    Puedes editarlas, quitarlas o agregar las tuyas; los puntos de cada respuesta se ajustan en
                    Ajustes → Scoring.
                  </div>
                </div>
              )}
              {cfg.questions.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Sin preguntas extra — el formulario pide nombre y email{cfg.ask_phone || isContact ? ' y teléfono' : ''}.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {cfg.questions.map((q, i) => (
                  <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {isLm && DEFAULT_LM_LABELS.has(q.label) && (
                      <span style={{
                        alignSelf: 'flex-start', fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.06em',
                        textTransform: 'uppercase', padding: '2px 7px', borderRadius: '8px',
                        color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.14)',
                      }}>
                        Por defecto · scoring
                      </span>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px auto', gap: '10px', alignItems: 'center' }}>
                      <input style={INPUT} value={q.label} onChange={e => setQuestion(i, { label: e.target.value })} placeholder="¿Cuál es tu horizonte de compra?" />
                      <select
                        style={{ ...INPUT, cursor: 'pointer' }}
                        value={q.type}
                        onChange={e => {
                          const type = e.target.value as HostedQuestion['type']
                          setQuestion(i, { type, options: type === 'select' ? (q.options?.length ? q.options : ['']) : undefined })
                        }}
                      >
                        <option value="text">Texto</option>
                        <option value="select">Opciones</option>
                      </select>
                      <button onClick={() => set('questions', cfg.questions.filter((_, idx) => idx !== i))} title="Quitar" style={{ ...BTN_GHOST, padding: '6px 8px' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {q.type === 'select' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--border-subtle)' }}>
                        {(q.options ?? []).map((o, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input
                              style={{ ...INPUT, padding: '7px 10px', fontSize: '12px' }}
                              value={o}
                              placeholder={`Opción ${oi + 1}`}
                              onChange={e => setQuestion(i, { options: (q.options ?? []).map((x, xi) => xi === oi ? e.target.value : x) })}
                            />
                            <button
                              onClick={() => setQuestion(i, { options: (q.options ?? []).filter((_, xi) => xi !== oi) })}
                              title="Quitar opción"
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', padding: '4px' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => setQuestion(i, { options: [...(q.options ?? []), ''] })}
                          disabled={(q.options ?? []).length >= 12}
                          style={{ ...BTN_GHOST, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                        >
                          <Plus size={11} /> Agregar opción
                        </button>
                      </div>
                    )}
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={q.required} onChange={e => setQuestion(i, { required: e.target.checked })} style={{ accentColor: 'var(--accent-gold)' }} />
                      Obligatoria
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Quién lo preparó ───────────────────────────────────────────── */}
          <Section title={isEvent ? 'Quién lo organiza (opcional)' : 'Quién lo preparó (opcional)'}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <input style={INPUT} value={cfg.agent_intro?.name ?? ''} placeholder="Nombre del agente"
                onChange={e => setIntro({ name: e.target.value })} />
              <input style={INPUT} value={cfg.agent_intro?.title ?? ''} placeholder="Título (ej.: Asesora bilingüe · A&J)"
                onChange={e => setIntro({ title: e.target.value })} />
            </div>
            <textarea
              rows={2}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              value={cfg.agent_intro?.paragraph ?? ''}
              placeholder="Párrafo de presentación personal…"
              onChange={e => setIntro({ paragraph: e.target.value })}
            />
            {isLm && (
              <>
                <div>
                  <label style={LABEL}><Quote size={11} style={{ verticalAlign: '-1px', marginRight: '4px' }} />Cita personal (opcional)</label>
                  <input style={INPUT} value={cfg.agent_intro?.quote ?? ''} placeholder="Comprar casa cambió la vida de mi familia. Mi misión es que cambie la tuya."
                    onChange={e => setIntro({ quote: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <input style={INPUT} value={cfg.agent_intro?.whatsapp_url ?? ''} placeholder="WhatsApp: https://wa.me/1…"
                    onChange={e => setIntro({ whatsapp_url: e.target.value })} />
                  <input style={INPUT} value={cfg.agent_intro?.instagram_url ?? ''} placeholder="Instagram: https://instagram.com/…"
                    onChange={e => setIntro({ instagram_url: e.target.value })} />
                </div>
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {cfg.agent_intro?.photo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cfg.agent_intro.photo_url} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '50%', border: '1px solid var(--border-subtle)' }} />
              )}
              <button onClick={() => photoInputRef.current?.click()} disabled={imgBusy === 'photo'} style={BTN_GHOST}>
                {imgBusy === 'photo' ? 'Subiendo…' : cfg.agent_intro?.photo_url ? 'Cambiar foto' : 'Subir foto del agente'}
              </button>
              <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { handleImageUpload('photo', e.target.files?.[0] ?? null); e.target.value = '' }} />
            </div>
          </Section>

          {/* ── Testimonios + CTA final (solo lead magnet) ─────────────────── */}
          {isLm && (
            <>
              <Section title="Testimonios" hint="Citas reales de clientes — la IA nunca los inventa. Máx. 6.">
                <div>
                  <label style={LABEL}>Título de la sección</label>
                  <input style={INPUT} value={cfg.testimonials_title} onChange={e => set('testimonials_title', e.target.value)} placeholder="Ellos también pensaban que comprar era complicado" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ ...LABEL, marginBottom: 0 }}>Testimonios</label>
                  <button
                    onClick={() => set('testimonials', [...cfg.testimonials, { name: '', location: '', quote: '', photo_url: '' }])}
                    style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
                    disabled={cfg.testimonials.length >= 6}
                  >
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {cfg.testimonials.map((t, i) => (
                    <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                        <input style={INPUT} value={t.name} placeholder="Familia Flores" onChange={e => setTestimonial(i, { name: e.target.value })} />
                        <input style={INPUT} value={t.location} placeholder="Virginia Beach · Townhouse" onChange={e => setTestimonial(i, { location: e.target.value })} />
                        <button onClick={() => set('testimonials', cfg.testimonials.filter((_, idx) => idx !== i))} title="Quitar" style={{ ...BTN_GHOST, padding: '6px 8px' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                        value={t.quote}
                        placeholder="Lo que dijo el cliente, con sus palabras…"
                        onChange={e => setTestimonial(i, { quote: e.target.value })}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {t.photo_url && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={t.photo_url} alt="" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
                        )}
                        <button
                          onClick={() => { setTestiUploadIdx(i); testiInputRef.current?.click() }}
                          disabled={imgBusy === 'testimonial'}
                          style={{ ...BTN_GHOST, padding: '4px 10px' }}
                        >
                          {imgBusy === 'testimonial' && testiUploadIdx === i ? 'Subiendo…' : t.photo_url ? 'Cambiar foto' : 'Foto (opcional)'}
                        </button>
                        {t.photo_url && (
                          <button onClick={() => setTestimonial(i, { photo_url: '' })} style={{ ...BTN_GHOST, padding: '4px 10px' }}>Quitar foto</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <input ref={testiInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
                  onChange={e => { handleImageUpload('testimonial', e.target.files?.[0] ?? null, testiUploadIdx ?? undefined); e.target.value = '' }} />
              </Section>

              <Section title="CTA final" hint="El cierre de la página — invita a volver al formulario.">
                <div>
                  <label style={LABEL}>Título</label>
                  <input style={INPUT} value={cfg.final_cta_title} onChange={e => set('final_cta_title', e.target.value)} placeholder="Esta guía es tuya, gratis, hoy." />
                </div>
                <div>
                  <label style={LABEL}>Párrafo</label>
                  <textarea rows={2} style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} value={cfg.final_cta_paragraph} onChange={e => set('final_cta_paragraph', e.target.value)} placeholder="No importa si estás apenas explorando o listo para empezar…" />
                </div>
              </Section>
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
