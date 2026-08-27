'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Upload } from 'lucide-react'
import type { NewsletterSeries, NewsletterCoverSource } from '@/lib/data/newsletters'
import type { StudioImage } from '@/lib/studio/types'
import { NEWSLETTER_CONTENT_VERSION } from '@/lib/newsletters/content'
import { SUPPORTED_LANGUAGE_CODES, LANGUAGE_CONFIG } from '@/lib/config'
import { CoverPicker } from '../[id]/cover-picker'
import { createEdition } from '../actions'
import { GenerateModal } from '../generate-modal'
import { ImportModal } from '../import-modal'

// Formulario mínimo de creación: serie, titular, idioma y portada. El
// contenido nace con UN bloque (heading con el titular) porque
// NewsletterContentSchema exige al menos uno — el resto de la edición se
// construye ya dentro del editor completo (/newsletters/[id]).

interface Props {
  series:        NewsletterSeries[]
  studioImages:  StudioImage[]
  /** Las fuentes ya preparadas del tenant, para que el panel de IA las enseñe. */
  sourceDomains: string[]
}

export function NewEditionForm({ series, studioImages, sourceDomains }: Props) {
  const router = useRouter()
  const [showGenerate, setShowGenerate]   = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [channelId, setChannelId]         = useState(series[0]?.id ?? '')
  const [title, setTitle]                 = useState('')
  const [language, setLanguage]           = useState('es')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [coverSource, setCoverSource]     = useState<NewsletterCoverSource>('upload')
  const [error, setError]                 = useState<string | null>(null)
  const [isPending, startTransition]      = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!channelId) { setError('Elige una serie.'); return }
    if (!title.trim()) { setError('La edición necesita un titular.'); return }
    if (!coverImageUrl) { setError('La edición necesita una imagen de portada.'); return }

    startTransition(async () => {
      const res = await createEdition({
        channelId,
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
      })
      if (!res.ok) { setError(res.error); return }
      router.push(`/newsletters/${res.data.id}`)
    })
  }

  if (series.length === 0) {
    return (
      <div style={{ maxWidth: '480px' }}>
        <BackLink />
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Todavía no hay ninguna serie. Crea una desde{' '}
          <Link href="/newsletters" style={{ color: 'var(--accent-gold)' }}>Newsletters</Link>{' '}
          antes de escribir una edición.
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <BackLink />
      {/* "Generar con IA" vive AQUÍ, junto al título, y abre el panel en esta
          misma página. Antes era un banner con un enlace a /newsletters?generar=1:
          parecía un campo del formulario y además te sacaba de la pantalla en la
          que ya estabas creando la edición. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', marginBottom: '20px',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
          Nueva edición
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            className="nl-generate-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            <Sparkles size={14} />
            Generar con IA
          </button>
          {/* La alternativa gratuita: redactar en la IA que el cliente ya paga
              y traer el JSON. Va al lado y no escondido, porque para quien ya
              tiene su propia IA es el camino por defecto, no el de repuesto. */}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="nl-generate-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            <Upload size={14} />
            Importar de tu IA
          </button>
        </div>
      </div>

      <style>{`
        .nl-new-input:focus { border-color: var(--border-accent) !important; }
        .nl-generate-cta:hover { border-color: var(--border-hover) !important; color: var(--text-primary) !important; }
      `}</style>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={LABEL_STYLE}>Serie *</label>
          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="nl-new-input"
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
          >
            {series.map(s => (
              <option key={s.id} value={s.id} style={{ background: '#16181C' }}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={LABEL_STYLE}>Titular *</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Qué pasó esta semana en Hampton Roads"
            required
            autoFocus
            className="nl-new-input"
            style={INPUT_STYLE}
          />
        </div>

        <div>
          <label style={LABEL_STYLE}>Idioma</label>
          <select
            value={language}
            onChange={e => setLanguage(e.target.value)}
            className="nl-new-input"
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
          >
            {SUPPORTED_LANGUAGE_CODES.map(code => (
              <option key={code} value={code} style={{ background: '#16181C' }}>{LANGUAGE_CONFIG[code].label}</option>
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

        {error && <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Link
            href="/newsletters"
            style={{
              padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
              border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', textDecoration: 'none',
            }}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
              cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creando…' : 'Crear edición'}
          </button>
        </div>
      </form>

      <GenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        series={series}
        sourceDomains={sourceDomains}
      />

      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        series={series}
      />
    </div>
  )
}

function BackLink() {
  return (
    <div style={{ marginBottom: '20px' }}>
      <Link href="/newsletters" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
        <ArrowLeft size={14} /> Newsletters
      </Link>
    </div>
  )
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box',
}
