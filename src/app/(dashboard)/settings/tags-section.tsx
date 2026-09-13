'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X } from 'lucide-react'
import {
  tagChipStyle, TAG_COLORS, TAG_NAME_MAX, TAG_DESCRIPTION_MAX, DEFAULT_TAG_COLOR,
  type LeadTag,
} from '@/lib/leads/tags'
import { createLeadTag, updateLeadTag, deleteLeadTag } from './tag-actions'

interface TagsSectionProps {
  tags:   LeadTag[]
  // Cuántos leads usan cada etiqueta, para que borrar no parezca gratis.
  counts: Record<string, number>
}

const INPUT: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 11px', fontSize: '13px',
  color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
}

// Selector de color de la paleta. Cerrado y no libre: un chip con un color
// arbitrario deja de leerse sobre el fondo, y el valor de un chip es
// reconocerlo de un vistazo.
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
      {TAG_COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          title={c.label}
          aria-label={c.label}
          aria-pressed={value.toLowerCase() === c.value.toLowerCase()}
          style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: c.value, cursor: 'pointer',
            border: value.toLowerCase() === c.value.toLowerCase()
              ? '2px solid var(--text-primary)'
              : '2px solid transparent',
            padding: 0,
          }}
        />
      ))}
    </div>
  )
}

export function TagsSection({ tags, counts }: TagsSectionProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Alta
  const [adding, setAdding]       = useState(false)
  const [newName, setNewName]     = useState('')
  const [newColor, setNewColor]   = useState<string>(DEFAULT_TAG_COLOR)
  const [newDesc, setNewDesc]     = useState('')

  // Edición en línea
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName]   = useState('')
  const [editColor, setEditColor] = useState<string>(DEFAULT_TAG_COLOR)
  const [editDesc, setEditDesc]   = useState('')

  // Borrado (un paso de confirmación: el conteo es la información que falta)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error); return }
      after?.()
      router.refresh()
    })
  }

  function startEdit(tag: LeadTag) {
    setConfirmDelete(null)
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
    setEditDesc(tag.description ?? '')
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '24px',
    }}>
      <div style={{ marginBottom: '18px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
          Etiquetas de leads
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.55, maxWidth: '620px' }}>
          Son lo que tu equipo decide sobre un lead: &ldquo;contactado sin respuesta&rdquo;,
          &ldquo;pre-aprobado&rdquo;, &ldquo;cliente de otro agente&rdquo;. Filtran la lista y sirven
          de supervisión. No sustituyen a la etapa (la mueve el embudo) ni a la fuente
          (de dónde vino el lead). Renombrar una etiqueta no rompe los filtros
          guardados; borrarla la quita de todos los leads que la tenían.
        </p>
      </div>

      {/* Catálogo */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tags.map((tag, idx) => {
          const chip    = tagChipStyle(tag.color)
          const count   = counts[tag.id] ?? 0
          const editing = editingId === tag.id

          return (
            <div
              key={tag.id}
              style={{
                display: 'flex', alignItems: editing ? 'flex-start' : 'center', gap: '12px',
                padding: '11px 0',
                borderBottom: idx < tags.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {editing ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    maxLength={TAG_NAME_MAX}
                    style={{ ...INPUT, maxWidth: '320px' }}
                  />
                  <input
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    maxLength={TAG_DESCRIPTION_MAX}
                    placeholder="Cuándo se usa (opcional)"
                    style={{ ...INPUT, maxWidth: '520px' }}
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                </div>
              ) : (
                <>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '3px 9px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                    color: chip.color, background: chip.background, border: chip.border,
                    flexShrink: 0,
                  }}>
                    {tag.name}
                  </span>
                  <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    {tag.description ?? ''}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {count === 0 ? 'sin leads' : `${count} ${count === 1 ? 'lead' : 'leads'}`}
                  </span>
                </>
              )}

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {editing ? (
                  <>
                    <button
                      onClick={() => run(
                        () => updateLeadTag(tag.id, { name: editName, color: editColor, description: editDesc }),
                        () => setEditingId(null),
                      )}
                      disabled={pending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '7px 12px', fontSize: '12px', fontWeight: 500,
                        background: 'var(--accent-gold)', color: 'var(--bg-base)',
                        border: 'none', borderRadius: '7px', cursor: 'pointer',
                      }}
                    >
                      <Check size={13} /> Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '7px 12px', fontSize: '12px', background: 'transparent',
                        border: '1px solid var(--border-subtle)', borderRadius: '7px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : confirmDelete === tag.id ? (
                  <>
                    <span style={{ fontSize: '12px', color: 'var(--accent-coral)', alignSelf: 'center' }}>
                      {count > 0 ? `Se quitará de ${count} ${count === 1 ? 'lead' : 'leads'}.` : '¿Borrar?'}
                    </span>
                    <button
                      onClick={() => run(() => deleteLeadTag(tag.id), () => setConfirmDelete(null))}
                      disabled={pending}
                      style={{
                        padding: '7px 12px', fontSize: '12px', fontWeight: 500,
                        background: 'rgba(201,123,107,0.12)', color: 'var(--accent-coral)',
                        border: '1px solid rgba(201,123,107,0.3)', borderRadius: '7px', cursor: 'pointer',
                      }}
                    >
                      Borrar
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '7px',
                        background: 'transparent', border: '1px solid var(--border-subtle)',
                        borderRadius: '7px', color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(tag)}
                      style={{
                        padding: '6px 11px', fontSize: '12px', background: 'transparent',
                        border: '1px solid var(--border-subtle)', borderRadius: '7px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setConfirmDelete(tag.id)}
                      title="Borrar etiqueta"
                      style={{
                        display: 'flex', alignItems: 'center', padding: '6px',
                        background: 'transparent', border: '1px solid var(--border-subtle)',
                        borderRadius: '7px', color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {tags.length === 0 && (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Todavía no hay etiquetas.
          </p>
        )}
      </div>

      {/* Alta */}
      <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--border-subtle)' }}>
        {adding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '520px' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              maxLength={TAG_NAME_MAX}
              placeholder="Nombre de la etiqueta"
              autoFocus
              style={INPUT}
            />
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              maxLength={TAG_DESCRIPTION_MAX}
              placeholder="Cuándo se usa (opcional)"
              style={INPUT}
            />
            <ColorPicker value={newColor} onChange={setNewColor} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => run(
                  () => createLeadTag(newName, newColor, newDesc),
                  () => { setAdding(false); setNewName(''); setNewDesc(''); setNewColor(DEFAULT_TAG_COLOR) },
                )}
                disabled={pending || newName.trim() === ''}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--accent-gold)', color: 'var(--bg-base)',
                  border: 'none', borderRadius: '8px',
                  cursor: pending || newName.trim() === '' ? 'not-allowed' : 'pointer',
                  opacity: newName.trim() === '' ? 0.5 : 1,
                }}
              >
                Crear etiqueta
              </button>
              <button
                onClick={() => { setAdding(false); setError(null) }}
                style={{
                  padding: '8px 14px', fontSize: '13px', background: 'transparent',
                  border: '1px solid var(--border-subtle)', borderRadius: '8px',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'transparent', border: '1px dashed var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Nueva etiqueta
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '12px' }}>{error}</div>
      )}
    </div>
  )
}
