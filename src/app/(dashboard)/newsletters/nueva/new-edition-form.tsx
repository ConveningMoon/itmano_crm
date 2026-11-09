'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Upload } from 'lucide-react'
import type { NewsletterCoverSource } from '@/lib/data/newsletters'
import type { StudioImage } from '@/lib/studio/types'
import { NEWSLETTER_CONTENT_VERSION } from '@/lib/newsletters/content'
import { NEWSLETTER_CATEGORIES, CATEGORY_LABELS, type NewsletterCategory } from '@/lib/newsletters/category'
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_CONFIG } from '@/lib/config'
import { CoverPicker } from '../[id]/cover-picker'
import { createEdition } from '../actions'
import { GenerateModal } from '../generate-modal'
import { ImportModal } from '../import-modal'

// Formulario mínimo de creación: titular, categoría, idioma y portada. El
// contenido nace con UN bloque (heading con el titular) porque
// NewsletterContentSchema exige al menos uno — el resto de la edición se
// construye ya dentro del editor completo (/newsletters/[id]).

interface Props {
  studioImages:  StudioImage[]
  /** Las fuentes ya preparadas del tenant, para que el panel de IA las enseñe. */
  sourceDomains: string[]
}

export function NewEditionForm({ studioImages, sourceDomains }: Props) {
  const router = useRouter()
  const fieldId = useId()
  const [showGenerate, setShowGenerate]   = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [title, setTitle]                 = useState('')
  const [category, setCategory]           = useState<NewsletterCategory>('informativo')
  const [language, setLanguage]           = useState('es')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverSource, setCoverSource]     = useState<NewsletterCoverSource>('upload')
  const [error, setError]                 = useState<string | null>(null)
  const [isPending, startTransition]      = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('La edición necesita un titular.'); return }
    if (!coverImageUrl) { setError('La edición necesita una imagen de portada.'); return }

    startTransition(async () => {
      const res = await createEdition({
        title: title.trim(),
        dek: null,
        language,
        coverImageUrl,
        coverSource,
        content: {
          v: NEWSLETTER_CONTENT_VERSION,
          blocks: [{ type: 'heading', level: 2, text: title.trim() }],
        },
        sources: [],
        dataAsOf: null,
        category,
      })
      if (!res.ok) { setError(res.error); return }
      router.push(`/newsletters/${res.data.id}`)
    })
  }

  return (
    <div className="nl-new">
      <BackLink />
      {/* "Generar con IA" vive AQUÍ, junto al título, y abre el panel en esta
          misma página. Antes era un banner con un enlace a /newsletters?generar=1:
          parecía un campo del formulario y además te sacaba de la pantalla en la
          que ya estabas creando la edición. */}
      <div className="page-header">
        <h1 className="page-title">Nueva edición</h1>
        <div className="page-actions">
          <button type="button" onClick={() => setShowGenerate(true)} className="btn btn-ghost">
            <Sparkles size={14} className="text-gold" aria-hidden="true" />
            Generar con IA
          </button>
          {/* La alternativa gratuita: redactar en la IA que el cliente ya paga
              y traer el JSON. Va al lado y no escondido, porque para quien ya
              tiene su propia IA es el camino por defecto, no el de repuesto. */}
          <button type="button" onClick={() => setShowImport(true)} className="btn btn-ghost">
            <Upload size={14} aria-hidden="true" />
            Importar de tu IA
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="settings-card settings-stack">
        <div>
          <label htmlFor={`${fieldId}-category`} className="settings-field-label">Categoría</label>
          <select
            id={`${fieldId}-category`}
            value={category}
            onChange={e => setCategory(e.target.value as NewsletterCategory)}
            className="settings-input settings-input-wide"
          >
            {NEWSLETTER_CATEGORIES.map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldId}-title`} className="settings-field-label">Titular *</label>
          <input
            id={`${fieldId}-title`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Qué pasó esta semana en Hampton Roads"
            required
            autoFocus
            className="settings-input settings-input-wide"
          />
        </div>

        <div>
          <label htmlFor={`${fieldId}-language`} className="settings-field-label">Idioma</label>
          <select
            id={`${fieldId}-language`}
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="settings-input settings-input-wide"
          >
            {SUPPORTED_LANGUAGE_CODES.map(code => (
              <option key={code} value={code}>{LANGUAGE_CONFIG[code].label}</option>
            ))}
          </select>
        </div>

        <CoverPicker
          coverImageUrl={coverImageUrl}
          coverSource={coverSource}
          studioImages={studioImages}
          canEdit
          onChange={next => { setCoverImageUrl(next.coverImageUrl); setCoverSource(next.coverSource) }}
        />

        {error && <p role="alert" className="form-error">{error}</p>}

        <div className="settings-modal-actions">
          <Link href="/newsletters" className="btn btn-ghost">Cancelar</Link>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending && <span className="loading-spinner" aria-hidden="true" />}
            {isPending ? 'Creando…' : 'Crear edición'}
          </button>
        </div>
      </form>

      <GenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        sourceDomains={sourceDomains}
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
      />
    </div>
  )
}

function BackLink() {
  return (
    <Link href="/newsletters" className="back-link">
      <ArrowLeft size={14} aria-hidden="true" /> Newsletters
    </Link>
  )
}

