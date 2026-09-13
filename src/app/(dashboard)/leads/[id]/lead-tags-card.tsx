'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Tag as TagIcon } from 'lucide-react'
import { tagChipStyle, type LeadTag } from '@/lib/leads/tags'
import { addTagToLead, removeTagFromLead } from './tag-actions'

interface LeadTagsCardProps {
  leadId:  string
  // Etiquetas que ya tiene el lead, en orden del catálogo.
  tags:    LeadTag[]
  // Catálogo completo del tenant, para el desplegable de "añadir".
  catalog: LeadTag[]
  // El rol 'agent' etiqueta sus leads; lo que no puede es crear etiquetas nuevas
  // (eso es Configuración). Si el catálogo está vacío, el aviso lo dice.
  canEdit: boolean
}

// Etiquetas del lead. Una etiqueta es lo que una persona decide sobre el lead
// ("contactado sin respuesta"), a diferencia de la etapa —que mueve el embudo— y
// de la calidad o la urgencia, que las calcula el scoring.
export function LeadTagsCard({ leadId, tags, catalog, canEdit }: LeadTagsCardProps) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()

  const assigned  = new Set(tags.map(t => t.id))
  const available = catalog.filter(t => !assigned.has(t.id))

  function add(tagId: string) {
    setError(null); setOpen(false)
    start(async () => {
      const res = await addTagToLead(leadId, tagId)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  function remove(tagId: string) {
    setError(null)
    start(async () => {
      const res = await removeTagFromLead(leadId, tagId)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '20px 24px', marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <TagIcon size={13} color="var(--text-muted)" />
        <span style={{
          fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          Etiquetas
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {tags.map(tag => {
          const chip = tagChipStyle(tag.color)
          return (
            <span
              key={tag.id}
              title={tag.description ?? undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 8px 4px 10px', borderRadius: '6px',
                fontSize: '12px', fontWeight: 500,
                color: chip.color, background: chip.background, border: chip.border,
              }}
            >
              {tag.name}
              {canEdit && (
                <button
                  onClick={() => remove(tag.id)}
                  disabled={pending}
                  title={`Quitar "${tag.name}"`}
                  style={{
                    display: 'flex', alignItems: 'center', background: 'none',
                    border: 'none', padding: 0, cursor: pending ? 'default' : 'pointer',
                    color: 'inherit', opacity: 0.65,
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )
        })}

        {tags.length === 0 && !canEdit && (
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sin etiquetas.</span>
        )}

        {canEdit && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOpen(o => !o)}
              disabled={pending || available.length === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '6px',
                fontSize: '12px', fontWeight: 500,
                background: 'transparent',
                border: '1px dashed var(--border-subtle)',
                color: 'var(--text-muted)',
                cursor: pending || available.length === 0 ? 'default' : 'pointer',
                opacity: available.length === 0 ? 0.5 : 1,
              }}
              title={available.length === 0
                ? (catalog.length === 0
                    ? 'No hay etiquetas en el catálogo. Se crean en Configuración.'
                    : 'Este lead ya tiene todas las etiquetas del catálogo.')
                : 'Añadir etiqueta'}
            >
              <Plus size={12} /> Etiqueta
            </button>

            {open && available.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20,
                minWidth: '240px', maxHeight: '280px', overflowY: 'auto',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '10px', padding: '6px',
                boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              }}>
                {available.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => add(tag.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                      padding: '7px 9px', borderRadius: '7px', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: '13px', color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: tag.color, flexShrink: 0,
                    }} />
                    <span style={{ flex: 1 }}>{tag.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '10px' }}>{error}</div>
      )}
    </div>
  )
}
