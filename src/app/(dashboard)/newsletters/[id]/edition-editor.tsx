'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import {
  NEWSLETTER_CONTENT_VERSION, NewsletterContentSchema, NewsletterSourceSchema,
  type NewsletterContent, type NewsletterSource,
} from '@/lib/newsletters/content'
import { publishBlockers } from '@/lib/newsletters/publishable'
import type { NewsletterEdition, NewsletterCoverSource, NewsletterStatus } from '@/lib/data/newsletters'
import type { StudioImage } from '@/lib/studio/types'
import { NEWSLETTER_CATEGORIES, CATEGORY_LABELS, type NewsletterCategory } from '@/lib/newsletters/category'
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_CONFIG } from '@/lib/config'
import { updateEdition, publishEdition, unpublishEdition } from '../actions'
import { CoverPicker } from './cover-picker'
import { BlockList } from './block-list'
import { SourcesPanel } from './sources-panel'

// Editor de una edición: cabecera fija (titular, portada, fecha de datos,
// idioma, estado, publicar) + el grid de bloques/preview (BlockList) + el
// panel de fuentes. publishBlockers corre sobre el estado local en cada
// render — es la MISMA función que usa el servidor, así que el botón nunca
// promete algo que publishEdition vaya a rechazar por un motivo distinto.

interface Props {
  edition:      NewsletterEdition
  canEdit:      boolean
  studioImages: StudioImage[]
  publicUrl:    string | null
}

const STATUS_LABEL: Record<NewsletterStatus, string> = {
  draft: 'Borrador', published: 'Publicada', archived: 'Archivada',
}
const STATUS_COLOR: Record<NewsletterStatus, string> = {
  draft: 'var(--accent-gold)', published: 'var(--accent-green)', archived: 'var(--text-muted)',
}

export function EditionEditor({ edition, canEdit, studioImages, publicUrl }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle]         = useState(edition.title)
  const [dek, setDek]             = useState(edition.dek ?? '')
  const [category, setCategory]   = useState<NewsletterCategory>(edition.category)
  const [language, setLanguage]   = useState(edition.language)
  const [coverImageUrl, setCoverImageUrl] = useState(edition.coverImageUrl)
  const [coverSource, setCoverSource]     = useState<NewsletterCoverSource>(edition.coverSource)
  const [dataAsOf, setDataAsOf]   = useState(edition.dataAsOf ?? '')
  const [content, setContent]     = useState<NewsletterContent>(
    edition.content ?? { v: NEWSLETTER_CONTENT_VERSION, blocks: [] },
  )
  const [sources, setSources]     = useState<NewsletterSource[]>(edition.sources)
  const [status, setStatus]       = useState<NewsletterStatus>(edition.status)

  const [saving, setSaving]       = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [savedAt, setSavedAt]     = useState<Date | null>(null)

  const blockers = publishBlockers({
    title, coverImageUrl: coverImageUrl || null, content, sources,
  })

  function validateForSave(): string | null {
    if (!title.trim()) return 'La edición necesita un titular.'
    const parsedContent = NewsletterContentSchema.safeParse(content)
    if (!parsedContent.success) {
      const issue = parsedContent.error.issues[0]
      return `Revisa el contenido: ${issue.message}`
    }
    const parsedSources = z.array(NewsletterSourceSchema).max(40).safeParse(sources)
    if (!parsedSources.success) {
      const issue = parsedSources.error.issues[0]
      return `Revisa las fuentes: ${issue.message}`
    }
    return null
  }

  function buildInput() {
    return {
      title:         title.trim(),
      dek:           dek.trim() || null,
      language,
      coverImageUrl,
      coverSource,
      content,
      sources,
      dataAsOf:      dataAsOf || null,
      category,
    }
  }

  function handleSave() {
    setError(null)
    const validationError = validateForSave()
    if (validationError) { setError(validationError); return }
    setSaving(true)
    startTransition(async () => {
      const res = await updateEdition(edition.id, buildInput())
      setSaving(false)
      if (!res.ok) { setError(res.error); return }
      setSavedAt(new Date())
      router.refresh()
    })
  }

  // Guarda el formulario ANTES de generar la portada con IA: la escena tiene
  // que reflejar el titular y la bajada reales, y `generateCoverForEdition`
  // sólo conoce lo que ya está guardado en la fila. Mismo criterio que
  // `handlePublish`, que también guarda antes del segundo paso.
  async function handleSaveBeforeGenerate(): Promise<{ ok: true } | { ok: false; error: string }> {
    setError(null)
    const validationError = validateForSave()
    if (validationError) { setError(validationError); return { ok: false, error: validationError } }
    const res = await updateEdition(edition.id, buildInput())
    if (!res.ok) { setError(res.error); return res }
    setSavedAt(new Date())
    return { ok: true }
  }

  function handlePublish() {
    setError(null)
    const validationError = validateForSave()
    if (validationError) { setError(validationError); return }
    setPublishing(true)
    startTransition(async () => {
      const saveRes = await updateEdition(edition.id, buildInput())
      if (!saveRes.ok) { setPublishing(false); setError(saveRes.error); return }
      const pubRes = await publishEdition(edition.id)
      setPublishing(false)
      if (!pubRes.ok) { setError(pubRes.error); return }
      setStatus('published')
      setSavedAt(new Date())
      router.refresh()
    })
  }

  function handleUnpublish() {
    setError(null)
    setPublishing(true)
    startTransition(async () => {
      const res = await unpublishEdition(edition.id)
      setPublishing(false)
      if (!res.ok) { setError(res.error); return }
      setStatus('draft')
      router.refresh()
    })
  }

  return (
    <>
      <style>{`
        .nl-editor-input:focus { border-color: var(--border-accent) !important; }
      `}</style>

      <div style={{ marginBottom: '20px' }}>
        <Link href="/newsletters" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Newsletters
        </Link>
      </div>

      {/* Cabecera fija */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', padding: '20px', marginBottom: '20px',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <input
              value={title}
              disabled={!canEdit}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titular de la edición"
              className="nl-editor-input"
              style={TITLE_INPUT_STYLE}
            />
            <input
              value={dek}
              disabled={!canEdit}
              onChange={e => setDek(e.target.value)}
              placeholder="Bajada (opcional)"
              className="nl-editor-input"
              style={DEK_INPUT_STYLE}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '3px 9px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: STATUS_COLOR[status], background: 'var(--bg-elevated)',
            }}>
              {STATUS_LABEL[status]}
            </span>
          </div>
        </div>

        <CoverPicker
          editionId={edition.id}
          coverImageUrl={coverImageUrl}
          coverSource={coverSource}
          studioImages={studioImages}
          canEdit={canEdit}
          onChange={next => { setCoverImageUrl(next.coverImageUrl); setCoverSource(next.coverSource) }}
          onBeforeGenerate={handleSaveBeforeGenerate}
        />

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={SMALL_LABEL}>Fecha de los datos</label>
            <input
              type="date"
              value={dataAsOf}
              disabled={!canEdit}
              onChange={e => setDataAsOf(e.target.value)}
              className="nl-editor-input"
              style={{ ...FIELD_INPUT_STYLE, width: '160px' }}
            />
          </div>
          <div>
            <label style={SMALL_LABEL}>Idioma</label>
            <select
              value={language}
              disabled={!canEdit}
              onChange={e => setLanguage(e.target.value)}
              className="nl-editor-input"
              style={{ ...FIELD_INPUT_STYLE, width: '160px', cursor: 'pointer' }}
            >
              {SUPPORTED_LANGUAGE_CODES.map(code => (
                <option key={code} value={code} style={{ background: '#16181C' }}>
                  {LANGUAGE_CONFIG[code].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={SMALL_LABEL}>Categoría</label>
            <select
              value={category}
              disabled={!canEdit}
              onChange={e => setCategory(e.target.value as NewsletterCategory)}
              className="nl-editor-input"
              style={{ ...FIELD_INPUT_STYLE, width: '160px', cursor: 'pointer' }}
            >
              {NEWSLETTER_CATEGORIES.map(c => (
                <option key={c} value={c} style={{ background: '#16181C' }}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {canEdit && (
          <div>
            {blockers.length > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: '0 0 10px' }}>
                {blockers[0].detail}
              </p>
            )}
            {error && (
              <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: '0 0 10px' }}>
                {error}
              </p>
            )}
            {savedAt && !error && (
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                Guardado {savedAt.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={handleSave}
                disabled={saving || publishing || isPending}
                style={{
                  ...SECONDARY_BUTTON,
                  opacity: (saving || publishing) ? 0.7 : 1,
                  cursor: (saving || publishing) ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>

              {status === 'published' ? (
                <button
                  onClick={handleUnpublish}
                  disabled={publishing || saving}
                  style={{
                    ...SECONDARY_BUTTON,
                    opacity: (saving || publishing) ? 0.7 : 1,
                    cursor: (saving || publishing) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {publishing ? 'Despublicando…' : 'Despublicar'}
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={publishing || saving || blockers.length > 0}
                  title={blockers[0]?.detail}
                  style={{
                    ...PRIMARY_BUTTON,
                    opacity: (publishing || saving || blockers.length > 0) ? 0.5 : 1,
                    cursor: (publishing || saving || blockers.length > 0) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {publishing ? 'Publicando…' : 'Publicar'}
                </button>
              )}

              {publicUrl && status === 'published' && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ ...SECONDARY_BUTTON, display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}
                >
                  <ExternalLink size={12} />
                  Ver página pública
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <BlockList
        content={content}
        sources={sources}
        canEdit={canEdit}
        onChange={setContent}
      />

      <div style={{ marginTop: '20px' }}>
        <SourcesPanel
          sources={sources}
          content={content}
          canEdit={canEdit}
          onChange={setSources}
        />
      </div>
    </>
  )
}

const TITLE_INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text-primary)', fontSize: '20px', fontWeight: 500, padding: '2px 0',
}
const DEK_INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  color: 'var(--text-secondary)', fontSize: '13px', padding: '2px 0', marginTop: '2px',
}
const FIELD_INPUT_STYLE: React.CSSProperties = {
  background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '7px 10px', color: 'var(--text-primary)', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}
const SMALL_LABEL: React.CSSProperties = {
  fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: '6px',
}
const SECONDARY_BUTTON: React.CSSProperties = {
  padding: '8px 16px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
}
const PRIMARY_BUTTON: React.CSSProperties = {
  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
  background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
}
