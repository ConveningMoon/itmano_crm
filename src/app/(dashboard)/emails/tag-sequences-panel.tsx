'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, Plus, Pause } from 'lucide-react'
import { LANGUAGE_CONFIG } from '@/lib/config'
import type { Language } from '@/lib/types'
import { tagChipStyle } from '@/lib/leads/tags'
import type { TagSequenceCoverage } from '@/lib/data/tag-sequences'
import { createTagSequence } from './tag-sequence-actions'

interface TagSequencesPanelProps {
  coverage: TagSequenceCoverage[]
  canManage: boolean
}

function langLabel(code: string): string {
  const cfg = LANGUAGE_CONFIG[code as Language]
  return cfg ? `${cfg.flag} ${cfg.label}` : code.toUpperCase()
}

// Correos obligatorios por etiqueta: una secuencia por etiqueta y por idioma que
// el equipo atiende. El panel existe para que el HUECO se vea — el disparo es
// silencioso por diseño (mandar en otro idioma sería peor que no mandar), así
// que sin esta vista nadie se enteraría de que los leads en inglés no reciben
// nada.
export function TagSequencesPanel({ coverage, canManage }: TagSequencesPanelProps) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  function create(tagId: string, language: string) {
    setError(null)
    setCreating(`${tagId}|${language}`)
    start(async () => {
      const res = await createTagSequence(tagId, language)
      setCreating(null)
      if (!res.ok) { setError(res.error); return }
      // Se abre directo: una secuencia recién creada no tiene pasos, y lo
      // siguiente que hay que hacer es escribir el primer correo.
      router.push(`/emails/${res.id}`)
    })
  }

  const missing = coverage.reduce(
    (n, c) => n + c.slots.filter(s => s.sequence === null).length,
    0,
  )

  if (coverage.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)',
        borderRadius: '12px', padding: '48px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '6px' }}>
          Ninguna etiqueta manda correos
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
          En Configuración → Etiquetas puedes marcar cuáles deben tener su propio correo
          automático. Aparecerán aquí, con un hueco por cada idioma que atiende el equipo.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.55, maxWidth: '680px' }}>
          Estos correos no se mandan a una lista: salen solos cuando alguien pone la
          etiqueta a un lead. Hace falta una versión por cada idioma que atiende el
          equipo — el lead recibe la de su idioma, y si esa versión no existe no se le
          manda nada. Los idiomas vienen de Configuración → Agentes.
        </p>
        {missing > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px', marginTop: '12px',
            padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
            color: 'var(--accent-gold)',
            background: 'color-mix(in srgb, var(--accent-gold) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-gold) 25%, transparent)',
          }}>
            <AlertTriangle size={13} />
            {missing === 1
              ? 'Falta 1 versión por escribir: esos leads no reciben nada.'
              : `Faltan ${missing} versiones por escribir: esos leads no reciben nada.`}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {coverage.map(({ tag, slots }) => {
          const chip = tagChipStyle(tag.color)
          return (
            <div
              key={tag.id}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '12px', padding: '18px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                  color: chip.color, background: chip.background, border: chip.border,
                }}>
                  {tag.name}
                </span>
                {!tag.requiresSequence && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    ya no está marcada como obligatoria
                  </span>
                )}
              </div>
              {tag.description && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  {tag.description}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {slots.map((slot, idx) => (
                  <div
                    key={slot.language}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0',
                      borderTop: idx === 0 ? '1px solid var(--border-subtle)' : 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '130px', flexShrink: 0 }}>
                      {langLabel(slot.language)}
                    </span>

                    {slot.sequence ? (
                      <>
                        <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                          {slot.sequence.stepCount === 0
                            ? 'Sin pasos: no envía nada todavía'
                            : `${slot.sequence.stepCount} ${slot.sequence.stepCount === 1 ? 'correo' : 'correos'}`}
                          {slot.sequence.activeRunCount > 0 && ` · ${slot.sequence.activeRunCount} en curso`}
                        </span>
                        {slot.sequence.stepCount === 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--accent-gold)', flexShrink: 0 }}>
                            <AlertTriangle size={12} /> incompleta
                          </span>
                        ) : !slot.sequence.active ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                            <Pause size={12} /> desactivada
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--accent-green)', flexShrink: 0 }}>
                            <Check size={12} /> lista
                          </span>
                        )}
                        <Link
                          href={`/emails/${slot.sequence.id}`}
                          style={{
                            fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none',
                            padding: '5px 10px', borderRadius: '7px', flexShrink: 0,
                            border: '1px solid color-mix(in srgb, var(--accent-gold) 25%, transparent)',
                          }}
                        >
                          Editar
                        </Link>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '12px', color: 'var(--accent-gold)' }}>
                          Sin escribir — estos leads no reciben nada
                        </span>
                        {canManage && (
                          <button
                            onClick={() => create(tag.id, slot.language)}
                            disabled={pending}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              padding: '5px 11px', fontSize: '12px', fontWeight: 500,
                              background: 'transparent', borderRadius: '7px', flexShrink: 0,
                              border: '1px dashed var(--border-subtle)',
                              color: 'var(--text-muted)',
                              cursor: pending ? 'default' : 'pointer',
                            }}
                          >
                            <Plus size={12} />
                            {creating === `${tag.id}|${slot.language}` ? 'Creando…' : 'Escribir'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '14px' }}>{error}</div>
      )}
    </div>
  )
}
