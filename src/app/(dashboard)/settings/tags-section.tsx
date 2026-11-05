'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check, X, Mail, AlertCircle } from 'lucide-react'
import {
  tagChipStyle, TAG_COLORS, TAG_NAME_MAX, TAG_DESCRIPTION_MAX, DEFAULT_TAG_COLOR,
  type LeadTag,
} from '@/lib/leads/tags'
import { createLeadTag, updateLeadTag, deleteLeadTag } from './tag-actions'
import { SettingsSectionHead } from '@/components/ui/settings-row'
import { InfoHint } from '@/components/ui/info-hint'

interface TagsSectionProps {
  tags:   LeadTag[]
  // Cuántos leads usan cada etiqueta, para que borrar no parezca gratis.
  counts: Record<string, number>
}

// Selector de color de la paleta. Cerrado y no libre: un chip con un color
// arbitrario deja de leerse sobre el fondo, y el valor de un chip es
// reconocerlo de un vistazo. El color de cada muestra es dato del usuario.
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="settings-tag-palette">
      {TAG_COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          className="settings-tag-color"
          onClick={() => onChange(c.value)}
          title={c.label}
          aria-label={c.label}
          aria-pressed={value.toLowerCase() === c.value.toLowerCase()}
          style={{ background: c.value }}
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
  const [editRequires, setEditRequires] = useState(false)

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
    setEditRequires(tag.requiresSequence)
  }

  return (
    <div>
      <SettingsSectionHead
        title="Etiquetas de leads"
        description="Lo que tu equipo decide sobre cada lead."
        action={(
          <InfoHint label="Para qué sirven las etiquetas">
            Son lo que tu equipo decide sobre un lead: &ldquo;contactado sin respuesta&rdquo;,
            &ldquo;pre-aprobado&rdquo;, &ldquo;cliente de otro agente&rdquo;. Filtran la lista y sirven
            de supervisión. No sustituyen a la etapa (la mueve el embudo) ni a la fuente
            (de dónde vino el lead). Renombrar una etiqueta no rompe los filtros
            guardados; borrarla la quita de todos los leads que la tenían.
          </InfoHint>
        )}
      />

      <div className="settings-card">
        {/* Catálogo */}
        <div>
          {tags.map(tag => {
            const chip    = tagChipStyle(tag.color)
            const count   = counts[tag.id] ?? 0
            const editing = editingId === tag.id

            return (
              <div key={tag.id} className="settings-tag" data-editing={editing || undefined}>
                {editing ? (
                  <div className="settings-tag-form">
                    <input
                      id={`tag-name-${tag.id}`}
                      className="settings-input"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      maxLength={TAG_NAME_MAX}
                      aria-label="Nombre de la etiqueta"
                    />
                    <input
                      id={`tag-desc-${tag.id}`}
                      className="settings-input"
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      maxLength={TAG_DESCRIPTION_MAX}
                      placeholder="Cuándo se usa (opcional)"
                      aria-label="Cuándo se usa"
                    />
                    <ColorPicker value={editColor} onChange={setEditColor} />
                    <label className="settings-tag-require settings-note">
                      <input
                        type="checkbox"
                        checked={editRequires}
                        onChange={e => setEditRequires(e.target.checked)}
                      />
                      <span>
                        Manda un correo automático al lead
                        <span className="settings-tag-require-note">
                          Marcarla no escribe el correo: aparece en Email → Por etiqueta, con un
                          hueco por cada idioma que atiende el equipo.
                        </span>
                      </span>
                    </label>
                  </div>
                ) : (
                  <>
                    <span
                      className="settings-tag-chip"
                      style={{ color: chip.color, background: chip.background, border: chip.border }}
                    >
                      {tag.name}
                    </span>
                    <span className="settings-tag-desc">{tag.description ?? ''}</span>
                    {tag.requiresSequence && (
                      <span
                        className="settings-tag-mail"
                        title="Al poner esta etiqueta se le envía un correo automático al lead"
                      >
                        <Mail size={12} aria-hidden="true" /> manda correos
                      </span>
                    )}
                    <span className="settings-tag-count">
                      {count === 0 ? 'sin leads' : `${count} ${count === 1 ? 'lead' : 'leads'}`}
                    </span>
                  </>
                )}

                <div className="settings-tag-actions">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => run(
                          () => updateLeadTag(tag.id, {
                            name: editName, color: editColor, description: editDesc,
                            requiresSequence: editRequires,
                          }),
                          () => setEditingId(null),
                        )}
                        disabled={pending}
                      >
                        <Check size={13} aria-hidden="true" /> {pending ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)} disabled={pending}>
                        Cancelar
                      </button>
                    </>
                  ) : confirmDelete === tag.id ? (
                    <>
                      <span className="settings-tag-confirm" role="status">
                        {count > 0 ? `Se quitará de ${count} ${count === 1 ? 'lead' : 'leads'}.` : '¿Borrar?'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => run(() => deleteLeadTag(tag.id), () => setConfirmDelete(null))}
                        disabled={pending}
                      >
                        {pending ? 'Borrando…' : 'Borrar'}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setConfirmDelete(null)}
                        disabled={pending}
                        aria-label="Cancelar el borrado"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-ghost" onClick={() => startEdit(tag)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setConfirmDelete(tag.id)}
                        title="Borrar etiqueta"
                        aria-label={`Borrar la etiqueta ${tag.name}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {tags.length === 0 && (
            <p className="settings-empty">Todavía no hay etiquetas.</p>
          )}
        </div>

        {/* Alta */}
        <div className="settings-tag-add">
          {adding ? (
            <div className="settings-tag-form">
              <input
                id="tag-new-name"
                className="settings-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                maxLength={TAG_NAME_MAX}
                placeholder="Nombre de la etiqueta"
                aria-label="Nombre de la etiqueta"
                autoFocus
              />
              <input
                id="tag-new-desc"
                className="settings-input"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                maxLength={TAG_DESCRIPTION_MAX}
                placeholder="Cuándo se usa (opcional)"
                aria-label="Cuándo se usa"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <div className="settings-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => run(
                    () => createLeadTag(newName, newColor, newDesc),
                    () => { setAdding(false); setNewName(''); setNewDesc(''); setNewColor(DEFAULT_TAG_COLOR) },
                  )}
                  disabled={pending || newName.trim() === ''}
                >
                  {pending ? 'Creando…' : 'Crear etiqueta'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setAdding(false); setError(null) }}
                  disabled={pending}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
              <Plus size={13} aria-hidden="true" /> Nueva etiqueta
            </button>
          )}
        </div>

        {error && (
          <p className="settings-alert settings-alert-gap" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {error}
          </p>
        )}
      </div>
    </div>
  )
}
