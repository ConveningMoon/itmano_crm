'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { NewsletterContent, NewsletterSource } from '@/lib/newsletters/content'

// Panel de fuentes de la edición. Añadir/editar es libre; eliminar avisa ANTES
// de cuántos bloques citan la fuente — si no, el bloqueo de publicación
// (publishBlockers → fuente_inexistente) aparece después sin que nadie sepa
// por qué.

interface Props {
  sources: NewsletterSource[]
  content: NewsletterContent
  canEdit: boolean
  onChange: (sources: NewsletterSource[]) => void
}

interface FormState {
  id:           string
  url:          string
  title:        string
  publisher:    string
  published_at: string
  accessed_at:  string
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function genId(): string {
  return `src_${Math.random().toString(36).slice(2, 10)}`
}

function emptyForm(): FormState {
  return { id: genId(), url: '', title: '', publisher: '', published_at: '', accessed_at: today() }
}

function countCitations(content: NewsletterContent, sourceId: string): number {
  return content.blocks.filter(b => {
    if (b.type === 'stat') return b.sourceIds.includes(sourceId)
    if (b.type === 'paragraph') return b.sourceIds?.includes(sourceId) ?? false
    return false
  }).length
}

export function SourcesPanel({ sources, content, canEdit, onChange }: Props) {
  const [mode, setMode]     = useState<'idle' | 'add' | 'edit'>('idle')
  const [form, setForm]     = useState<FormState>(emptyForm())
  const [error, setError]   = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string; count: number } | null>(null)

  function openAdd() {
    setForm(emptyForm())
    setError(null)
    setMode('add')
  }

  function openEdit(s: NewsletterSource) {
    setForm({
      id: s.id, url: s.url, title: s.title,
      publisher: s.publisher ?? '', published_at: s.published_at ?? '', accessed_at: s.accessed_at,
    })
    setError(null)
    setMode('edit')
  }

  function closeModal() {
    setMode('idle')
    setError(null)
  }

  function handleSave() {
    if (!form.url.trim() || !form.title.trim()) {
      setError('La fuente necesita URL y título.')
      return
    }
    try {
      new URL(form.url)
    } catch {
      setError('La URL no es válida.')
      return
    }
    const clean: NewsletterSource = {
      id: form.id,
      url: form.url.trim(),
      title: form.title.trim(),
      publisher: form.publisher.trim(),
      accessed_at: form.accessed_at || today(),
      ...(form.published_at.trim() ? { published_at: form.published_at.trim() } : {}),
    }
    onChange(mode === 'add' ? [...sources, clean] : sources.map(s => (s.id === clean.id ? clean : s)))
    closeModal()
  }

  function requestDelete(s: NewsletterSource) {
    setConfirmDelete({ id: s.id, title: s.title, count: countCitations(content, s.id) })
  }

  function confirmDeleteNow() {
    if (!confirmDelete) return
    onChange(sources.filter(s => s.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
      <style>{`
        .nl-source-row { transition: background 0.1s; }
        .nl-source-row:hover { background: var(--bg-elevated) !important; }
        .nl-source-input:focus { border-color: var(--border-accent) !important; }
      `}</style>

      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Fuentes</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {sources.length} {sources.length === 1 ? 'fuente' : 'fuentes'}
          </span>
        </div>
        {canEdit && (
          <button onClick={openAdd} style={ADD_BUTTON}>
            <Plus size={12} /> Añadir fuente
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div style={{ padding: '20px 18px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Sin fuentes todavía. Un bloque de dato necesita al menos una para poder publicarse.
        </div>
      ) : (
        sources.map((s, idx) => (
          <div
            key={s.id}
            className="nl-source-row"
            style={{
              padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '12px',
              borderTop: idx > 0 ? '1px solid var(--border-subtle)' : undefined,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[s.publisher, s.url].filter(Boolean).join(' · ')}
              </div>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button onClick={() => openEdit(s)} title="Editar" style={ICON_BUTTON}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => requestDelete(s)} title="Eliminar" style={ICON_BUTTON_DANGER}>
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* Añadir / editar */}
      <ModalShell open={mode === 'add' || mode === 'edit'} onClose={closeModal} maxWidth={440}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {mode === 'add' ? 'Añadir fuente' : 'Editar fuente'}
            </span>
            <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={LABEL_STYLE}>URL *</label>
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
                autoFocus
                className="nl-source-input"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Título *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="nl-source-input"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label style={LABEL_STYLE}>Medio</label>
              <input
                value={form.publisher}
                onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))}
                placeholder="Opcional"
                className="nl-source-input"
                style={INPUT_STYLE}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={LABEL_STYLE}>Fecha de publicación</label>
                <input
                  type="date"
                  value={form.published_at}
                  onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))}
                  className="nl-source-input"
                  style={INPUT_STYLE}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={LABEL_STYLE}>Fecha de consulta</label>
                <input
                  type="date"
                  value={form.accessed_at}
                  onChange={e => setForm(f => ({ ...f, accessed_at: e.target.value }))}
                  className="nl-source-input"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            {error && <p style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button onClick={closeModal} style={CANCEL_BUTTON}>Cancelar</button>
              <button onClick={handleSave} style={SAVE_BUTTON}>
                {mode === 'add' ? 'Añadir' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Confirmar eliminación */}
      <ModalShell open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} maxWidth={400}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar fuente</span>
            <button onClick={() => setConfirmDelete(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {confirmDelete && confirmDelete.count > 0 ? (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'flex-start',
              background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.18)',
              borderRadius: '8px', padding: '12px 14px', marginBottom: '20px',
            }}>
              <AlertTriangle size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                {confirmDelete.count === 1
                  ? 'Esta fuente está citada por 1 bloque.'
                  : `Esta fuente está citada por ${confirmDelete.count} bloques.`}
                {' '}Si la eliminas, esos bloques citarán una fuente inexistente y la edición no podrá publicarse hasta que lo corrijas.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              ¿Eliminar &quot;{confirmDelete?.title}&quot;? Ningún bloque la cita todavía.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button onClick={() => setConfirmDelete(null)} style={CANCEL_BUTTON}>Cancelar</button>
            <button onClick={confirmDeleteNow} style={DELETE_BUTTON}>Eliminar</button>
          </div>
        </div>
      </ModalShell>
    </div>
  )
}

const ADD_BUTTON: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', fontSize: '12px', fontWeight: 500,
  background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
  border: '1px solid rgba(201,169,110,0.2)', borderRadius: '8px', cursor: 'pointer',
}
const ICON_BUTTON: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px',
  borderRadius: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-secondary)', cursor: 'pointer',
}
const ICON_BUTTON_DANGER: React.CSSProperties = {
  ...ICON_BUTTON,
  background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)', color: 'var(--accent-coral)',
}
const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}
const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}
const CANCEL_BUTTON: React.CSSProperties = {
  padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
  background: 'transparent', border: '1px solid var(--border-subtle)',
  color: 'var(--text-muted)', cursor: 'pointer',
}
const SAVE_BUTTON: React.CSSProperties = {
  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
  background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer',
}
const DELETE_BUTTON: React.CSSProperties = {
  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
  background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
  border: '1px solid rgba(201,123,107,0.3)', cursor: 'pointer',
}
