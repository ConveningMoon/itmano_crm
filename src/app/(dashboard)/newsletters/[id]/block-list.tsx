'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Upload, Loader2 } from 'lucide-react'
import type { NewsletterBlock, NewsletterContent, NewsletterSource } from '@/lib/newsletters/content'

// Columna izquierda: bloques editables. Columna derecha: vista previa en JSX
// que espeja renderNewsletterHtml (src/lib/newsletters/render.ts) — MISMAS
// clases (nl-callout, nl-stat, nl-sources) para que este preview y la página
// pública se parezcan. render.ts es server-only y no se puede importar aquí;
// por eso las funciones de abajo (safeUrl, la unión de bloques) son una copia
// deliberada de su lógica, no una reexportación.

// Route Handler, no Server Action — ver src/app/api/newsletters/media/route.ts:
// una Server Action POSTea a la ruta de la página, que src/proxy.ts intercepta
// y corrompe el File binario. /api/* queda fuera de ese guard.
async function uploadBlockImage(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const fd = new FormData()
  fd.set('file', file)
  const res = await fetch('/api/newsletters/media', { method: 'POST', body: fd })
  try {
    return await res.json()
  } catch {
    return { ok: false, error: 'No se pudo subir el archivo. Verifica tu conexión e intenta de nuevo.' }
  }
}

interface Props {
  content: NewsletterContent
  sources: NewsletterSource[]
  canEdit: boolean
  onChange: (content: NewsletterContent) => void
}

const BLOCK_TYPE_LABEL: Record<NewsletterBlock['type'], string> = {
  heading:   'Encabezado',
  paragraph: 'Párrafo',
  list:      'Lista',
  image:     'Imagen',
  quote:     'Cita',
  callout:   'Aviso',
  stat:      'Dato',
}

function defaultBlock(type: NewsletterBlock['type']): NewsletterBlock {
  switch (type) {
    case 'heading':   return { type: 'heading', level: 2, text: 'Nuevo encabezado' }
    case 'paragraph': return { type: 'paragraph', text: 'Escribe el contenido…' }
    case 'list':      return { type: 'list', style: 'bullet', items: ['Elemento 1'] }
    case 'image':      return { type: 'image', url: '', alt: '' }
    case 'quote':      return { type: 'quote', text: 'Cita relevante' }
    case 'callout':    return { type: 'callout', tone: 'info', text: 'Información importante' }
    case 'stat':       return { type: 'stat', label: 'Dato', value: '0', sourceIds: [] }
  }
}

function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function BlockList({ content, sources, canEdit, onChange }: Props) {
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  // Un fallo de subida se PINTA, como en CoverPicker. Antes se tragaba (`if
  // (res.ok)` sin `else`): el spinner paraba, la URL seguía vacía y el usuario
  // no tenía forma de saber si había subido o no.
  const [uploadError, setUploadError] = useState<{ idx: number; message: string } | null>(null)
  const knownSourceIds = new Set(sources.map(s => s.id))

  function updateBlock(idx: number, next: NewsletterBlock) {
    const blocks = content.blocks.slice()
    blocks[idx] = next
    onChange({ ...content, blocks })
  }

  function addBlock(type: NewsletterBlock['type']) {
    onChange({ ...content, blocks: [...content.blocks, defaultBlock(type)] })
  }

  function removeBlock(idx: number) {
    onChange({ ...content, blocks: content.blocks.filter((_, i) => i !== idx) })
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= content.blocks.length) return
    const blocks = content.blocks.slice()
    const tmp = blocks[idx]
    blocks[idx] = blocks[target]
    blocks[target] = tmp
    onChange({ ...content, blocks })
  }

  async function uploadImageFor(idx: number, file: File) {
    setUploadingIdx(idx)
    setUploadError(null)
    const res = await uploadBlockImage(file)
    setUploadingIdx(null)
    if (!res.ok) {
      setUploadError({ idx, message: res.error })
      return
    }
    const block = content.blocks[idx]
    if (block.type === 'image') updateBlock(idx, { ...block, url: res.url })
  }

  return (
    <>
      <style>{`
        .nl-block-btn:hover:not(:disabled) { background: var(--bg-elevated) !important; }
        .nl-block-input:focus { border-color: var(--border-accent) !important; }
        .nl-editor-grid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
        @media (min-width: 1024px) { .nl-editor-grid { grid-template-columns: 1fr 1fr; } }
        .nl-preview h2 { font-size: 18px; font-weight: 600; color: var(--text-primary); margin: 0 0 10px; }
        .nl-preview h3 { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0 0 10px; }
        .nl-preview p { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin: 0 0 14px; }
        .nl-preview ul, .nl-preview ol { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin: 0 0 14px; padding-left: 20px; }
        .nl-preview figure { margin: 0 0 14px; }
        .nl-preview img { width: 100%; border-radius: 8px; display: block; }
        .nl-preview figcaption { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
        .nl-preview blockquote { margin: 0 0 14px; padding: 10px 14px; border-left: 3px solid var(--accent-gold); font-style: italic; color: var(--text-secondary); font-size: 13px; }
        .nl-preview cite { display: block; margin-top: 6px; font-size: 11px; color: var(--text-muted); font-style: normal; }
        .nl-callout { display: block; margin: 0 0 14px; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; }
        .nl-callout-info { background: rgba(91,142,201,0.1); border: 1px solid rgba(91,142,201,0.25); color: var(--text-secondary); }
        .nl-callout-warning { background: rgba(201,169,110,0.1); border: 1px solid rgba(201,169,110,0.25); color: var(--text-secondary); }
        .nl-stat { display: flex; flex-direction: column; gap: 2px; margin: 0 0 14px; }
        .nl-stat-value { font-size: 24px; font-weight: 600; color: var(--accent-gold); }
        .nl-stat-label { font-size: 12px; color: var(--text-muted); }
        .nl-sources { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-subtle); }
        .nl-sources h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin: 0 0 8px; font-weight: 600; }
        .nl-sources ol { font-size: 12px; color: var(--text-secondary); padding-left: 18px; margin: 0; }
        .nl-sources a { color: var(--accent-blue); }
      `}</style>

      <div className="nl-editor-grid">
        {/* Columna izquierda: bloques editables */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {content.blocks.length === 0 && (
            <div style={{
              padding: '24px 18px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)',
              border: '1px dashed var(--border-subtle)', borderRadius: '12px',
            }}>
              Todavía no hay bloques. Añade el primero abajo.
            </div>
          )}

          {content.blocks.map((block, idx) => (
            <BlockCard
              key={idx}
              block={block}
              index={idx}
              total={content.blocks.length}
              canEdit={canEdit}
              sources={sources}
              knownSourceIds={knownSourceIds}
              uploading={uploadingIdx === idx}
              uploadError={uploadError?.idx === idx ? uploadError.message : null}
              onChange={next => updateBlock(idx, next)}
              onRemove={() => removeBlock(idx)}
              onMove={dir => moveBlock(idx, dir)}
              onUploadImage={file => uploadImageFor(idx, file)}
            />
          ))}

          {canEdit && (
            <div>
              <label style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' }}>
                Añadir bloque
              </label>
              <select
                value=""
                onChange={e => {
                  const value = e.target.value
                  if (value) addBlock(value as NewsletterBlock['type'])
                  e.target.value = ''
                }}
                style={{ ...SELECT_STYLE, maxWidth: '240px' }}
              >
                <option value="" style={OPTION_BG}>+ Elegir tipo de bloque</option>
                {(Object.keys(BLOCK_TYPE_LABEL) as NewsletterBlock['type'][]).map(t => (
                  <option key={t} value={t} style={OPTION_BG}>{BLOCK_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Columna derecha: vista previa */}
        <div className="nl-preview" style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '12px', padding: '20px',
        }}>
          {content.blocks.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              La vista previa aparecerá cuando agregues bloques.
            </p>
          ) : (
            content.blocks.map((block, idx) => <BlockPreview key={idx} block={block} />)
          )}
          <SourcesPreview blocks={content.blocks} sources={sources} />
        </div>
      </div>
    </>
  )
}

// ─── Tarjeta editable de un bloque ──────────────────────────────────────────

function BlockCard({
  block, index, total, canEdit, sources, knownSourceIds, uploading, uploadError,
  onChange, onRemove, onMove, onUploadImage,
}: {
  block:   NewsletterBlock
  index:   number
  total:   number
  canEdit: boolean
  sources: NewsletterSource[]
  knownSourceIds: Set<string>
  uploading: boolean
  uploadError: string | null
  onChange: (next: NewsletterBlock) => void
  onRemove: () => void
  onMove:   (dir: -1 | 1) => void
  onUploadImage: (file: File) => void
}) {
  const invalidStatSources = block.type === 'stat' ? block.sourceIds.filter(id => !knownSourceIds.has(id)) : []
  const statNeedsSource = block.type === 'stat' && (block.sourceIds.length === 0 || invalidStatSources.length > 0)

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${statNeedsSource ? 'var(--accent-coral)' : 'var(--border-subtle)'}`,
      borderRadius: '12px', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {BLOCK_TYPE_LABEL[block.type]}
        </span>
        {canEdit && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <button type="button" className="nl-block-btn" onClick={() => onMove(-1)} disabled={index === 0}
              style={{ ...ICON_BTN, opacity: index === 0 ? 0.35 : 1, cursor: index === 0 ? 'default' : 'pointer' }}>
              <ChevronUp size={12} />
            </button>
            <button type="button" className="nl-block-btn" onClick={() => onMove(1)} disabled={index === total - 1}
              style={{ ...ICON_BTN, opacity: index === total - 1 ? 0.35 : 1, cursor: index === total - 1 ? 'default' : 'pointer' }}>
              <ChevronDown size={12} />
            </button>
            <button type="button" className="nl-block-btn" onClick={onRemove} style={{ ...ICON_BTN, color: 'var(--accent-coral)' }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {block.type === 'heading' && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            value={block.level}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })}
            style={{ ...SELECT_STYLE, width: '70px', flexShrink: 0 }}
          >
            <option value={2} style={OPTION_BG}>H2</option>
            <option value={3} style={OPTION_BG}>H3</option>
          </select>
          <input
            value={block.text}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, text: e.target.value })}
            className="nl-block-input"
            style={INPUT_STYLE}
          />
        </div>
      )}

      {block.type === 'paragraph' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            value={block.text}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, text: e.target.value })}
            rows={3}
            className="nl-block-input"
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
          />
          <div>
            <label style={SMALL_LABEL}>Fuentes citadas (opcional)</label>
            <SourceToggles
              sources={sources}
              selected={block.sourceIds ?? []}
              disabled={!canEdit}
              onToggle={id => {
                const cur = block.sourceIds ?? []
                const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]
                onChange({ ...block, sourceIds: next })
              }}
            />
          </div>
        </div>
      )}

      {block.type === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['bullet', 'number'] as const).map(style => (
              <button
                key={style}
                type="button"
                disabled={!canEdit}
                onClick={() => onChange({ ...block, style })}
                style={toggleStyle(block.style === style, canEdit)}
              >
                {style === 'bullet' ? 'Viñetas' : 'Numerada'}
              </button>
            ))}
          </div>
          {block.items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px' }}>
              <input
                value={item}
                disabled={!canEdit}
                onChange={e => {
                  const items = block.items.slice()
                  items[i] = e.target.value
                  onChange({ ...block, items })
                }}
                className="nl-block-input"
                style={INPUT_STYLE}
              />
              {canEdit && block.items.length > 1 && (
                <button type="button" className="nl-block-btn"
                  onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })}
                  style={ICON_BTN}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          {canEdit && block.items.length < 20 && (
            <button
              type="button"
              onClick={() => onChange({ ...block, items: [...block.items, 'Nuevo elemento'] })}
              style={{ ...GHOST_ADD_BTN, alignSelf: 'flex-start' }}
            >
              <Plus size={11} /> Añadir elemento
            </button>
          )}
        </div>
      )}

      {block.type === 'image' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input
            value={block.url}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, url: e.target.value })}
            placeholder="https://…"
            className="nl-block-input"
            style={INPUT_STYLE}
          />
          {canEdit && (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start',
              padding: '6px 12px', fontSize: '11px', fontWeight: 500,
              background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px',
              cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
            }}>
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {uploading ? 'Subiendo…' : 'Subir imagen'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={e => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) onUploadImage(file)
                }}
                style={{ display: 'none' }}
              />
            </label>
          )}
          {uploadError && (
            <p style={{ fontSize: '11px', color: 'var(--accent-coral)', margin: 0 }}>{uploadError}</p>
          )}
          <input
            value={block.alt}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, alt: e.target.value })}
            placeholder="Texto alternativo"
            className="nl-block-input"
            style={INPUT_STYLE}
          />
          <input
            value={block.caption ?? ''}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, caption: e.target.value || undefined })}
            placeholder="Pie de foto (opcional)"
            className="nl-block-input"
            style={INPUT_STYLE}
          />
        </div>
      )}

      {block.type === 'quote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            value={block.text}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, text: e.target.value })}
            rows={2}
            className="nl-block-input"
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
          />
          <input
            value={block.attribution ?? ''}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, attribution: e.target.value || undefined })}
            placeholder="Atribución (opcional)"
            className="nl-block-input"
            style={INPUT_STYLE}
          />
        </div>
      )}

      {block.type === 'callout' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['info', 'warning'] as const).map(tone => (
              <button
                key={tone}
                type="button"
                disabled={!canEdit}
                onClick={() => onChange({ ...block, tone })}
                style={toggleStyle(block.tone === tone, canEdit)}
              >
                {tone === 'info' ? 'Información' : 'Advertencia'}
              </button>
            ))}
          </div>
          <textarea
            value={block.text}
            disabled={!canEdit}
            onChange={e => onChange({ ...block, text: e.target.value })}
            rows={2}
            className="nl-block-input"
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
          />
        </div>
      )}

      {block.type === 'stat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={block.label}
              disabled={!canEdit}
              onChange={e => onChange({ ...block, label: e.target.value })}
              placeholder="Etiqueta"
              className="nl-block-input"
              style={INPUT_STYLE}
            />
            <input
              value={block.value}
              disabled={!canEdit}
              onChange={e => onChange({ ...block, value: e.target.value })}
              placeholder="Valor"
              className="nl-block-input"
              style={{ ...INPUT_STYLE, width: '120px', flexShrink: 0 }}
            />
          </div>
          <div>
            <label style={SMALL_LABEL}>Fuentes citadas (obligatorio)</label>
            <SourceToggles
              sources={sources}
              selected={block.sourceIds}
              disabled={!canEdit}
              onToggle={id => {
                const next = block.sourceIds.includes(id)
                  ? block.sourceIds.filter(x => x !== id)
                  : [...block.sourceIds, id]
                onChange({ ...block, sourceIds: next })
              }}
            />
            {statNeedsSource && (
              <p style={{ fontSize: '11px', color: 'var(--accent-coral)', margin: '6px 0 0' }}>
                {block.sourceIds.length === 0
                  ? 'Este dato no tiene fuente. No podrás publicar mientras falte.'
                  : 'Este dato cita una fuente que ya no existe.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function toggleStyle(active: boolean, canEdit: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', fontSize: '11px', fontWeight: 500, borderRadius: '6px',
    cursor: canEdit ? 'pointer' : 'default',
    background: active ? 'rgba(201,169,110,0.12)' : 'transparent',
    color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
    border: `1px solid ${active ? 'rgba(201,169,110,0.3)' : 'var(--border-subtle)'}`,
  }
}

function SourceToggles({ sources, selected, disabled, onToggle }: {
  sources: NewsletterSource[]
  selected: string[]
  disabled: boolean
  onToggle: (id: string) => void
}) {
  if (sources.length === 0) {
    return (
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
        Agrega fuentes en el panel de abajo para poder citarlas.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
      {sources.map(s => {
        const active = selected.includes(s.id)
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(s.id)}
            title={s.title}
            style={{
              padding: '3px 10px', fontSize: '11px', borderRadius: '12px', cursor: disabled ? 'default' : 'pointer',
              background: active ? 'rgba(201,169,110,0.15)' : 'var(--bg-elevated)',
              color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
              border: `1px solid ${active ? 'rgba(201,169,110,0.35)' : 'var(--border-subtle)'}`,
              maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {s.title}
          </button>
        )
      })}
    </div>
  )
}

// ─── Vista previa (espeja render.ts) ────────────────────────────────────────

function BlockPreview({ block }: { block: NewsletterBlock }) {
  switch (block.type) {
    case 'heading':
      return block.level === 2 ? <h2>{block.text}</h2> : <h3>{block.text}</h3>
    case 'paragraph':
      return <p>{block.text}</p>
    case 'list':
      return block.style === 'number'
        ? <ol>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ol>
        : <ul>{block.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    case 'image': {
      const url = safeUrl(block.url)
      if (!url) return null
      return (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- reason: vista previa del editor, host variable (upload/Estudio/externo) */}
          <img src={url} alt={block.alt} loading="lazy" />
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      )
    }
    case 'quote':
      return (
        <blockquote>
          <p>{block.text}</p>
          {block.attribution && <cite>{block.attribution}</cite>}
        </blockquote>
      )
    case 'callout':
      return <aside className={`nl-callout nl-callout-${block.tone}`}>{block.text}</aside>
    case 'stat':
      return (
        <div className="nl-stat">
          <span className="nl-stat-value">{block.value}</span>
          <span className="nl-stat-label">{block.label}</span>
        </div>
      )
  }
}

function SourcesPreview({ blocks, sources }: { blocks: NewsletterBlock[]; sources: NewsletterSource[] }) {
  const cited = new Set<string>()
  for (const b of blocks) {
    if (b.type === 'stat') b.sourceIds.forEach(id => cited.add(id))
    if (b.type === 'paragraph') b.sourceIds?.forEach(id => cited.add(id))
  }
  const used = sources.filter(s => cited.has(s.id))
  if (used.length === 0) return null
  return (
    <section className="nl-sources">
      <h2>Fuentes</h2>
      <ol>
        {used.map(s => {
          const url = safeUrl(s.url)
          const label = s.publisher ? `${s.title} — ${s.publisher}` : s.title
          return (
            <li key={s.id}>
              {url ? <a href={url} rel="nofollow noopener" target="_blank">{label}</a> : label}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ─── Estilos compartidos ────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}
const SELECT_STYLE: React.CSSProperties = { ...INPUT_STYLE, cursor: 'pointer', appearance: 'none' }
const OPTION_BG: React.CSSProperties = { background: '#16181C' }
const ICON_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px',
  borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)', cursor: 'pointer',
}
const SMALL_LABEL: React.CSSProperties = {
  fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', display: 'block', marginBottom: '4px',
}
const GHOST_ADD_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '11px',
  fontWeight: 500, color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)',
  border: '1px solid rgba(201,169,110,0.2)', borderRadius: '6px', cursor: 'pointer',
}
