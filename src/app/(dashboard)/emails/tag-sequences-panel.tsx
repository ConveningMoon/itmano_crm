'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Pause, Pencil } from 'lucide-react'
import { LANGUAGE_CONFIG } from '@/lib/config'
import type { Language } from '@/lib/types'
import { tagChipStyle } from '@/lib/leads/tags'
import type { TagSequenceCoverage } from '@/lib/data/tag-sequences'
import { tagMatrix, type TagCellState } from '@/lib/emails/tag-matrix'
import { InfoHint } from '@/components/ui/info-hint'
import { TagSequencesImportTools } from './tag-sequences-import-tools'
import { ensureTagSequenceSlot } from './actions'

interface TagSequencesPanelProps {
  coverage: TagSequenceCoverage[]
  canManage: boolean
}

function langLabel(code: string): string {
  const cfg = LANGUAGE_CONFIG[code as Language]
  return cfg ? `${cfg.flag} ${cfg.label}` : code.toUpperCase()
}

const CELL_LINK: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  minWidth: '32px', minHeight: '32px', padding: '0 8px', borderRadius: '8px',
  fontSize: '12px', textDecoration: 'none',
}

// Hueco: crea la secuencia vacía de esa etiqueta e idioma y lleva a escribirla.
// Sin pasos no envía nada, así que crearla es seguro; si ya existía (otra
// pestaña, doble clic) la acción devuelve la misma.
function WriteButton({ tagId, language }: { tagId: string; language: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function write() {
    setError(null)
    startTransition(async () => {
      const res = await ensureTagSequenceSlot(tagId, language)
      if (!res.ok) { setError(res.error); return }
      router.push(`/emails/${res.id}`)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <button
        type="button"
        onClick={write}
        disabled={pending}
        aria-busy={pending}
        style={{
          ...CELL_LINK, cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.7 : 1,
          color: 'var(--accent-coral)',
          background: 'color-mix(in srgb, var(--accent-coral) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-coral) 30%, transparent)',
        }}
      >
        {pending ? <span aria-hidden className="loading-spinner" /> : <Pencil size={12} aria-hidden />}
        {pending ? 'Creando…' : 'Escribir'}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: '11px', color: 'var(--accent-coral)', textAlign: 'center', lineHeight: 1.3 }}>
          {error}
        </span>
      )}
    </div>
  )
}

const WRITE_STYLE: React.CSSProperties = {
  ...CELL_LINK,
  color: 'var(--accent-coral)',
  background: 'color-mix(in srgb, var(--accent-coral) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--accent-coral) 30%, transparent)',
}

const STATUS_TEXT: React.CSSProperties = { lineHeight: 1.25, textAlign: 'center' }

function Cell({
  state, tagId, tagName, language, sequenceId, steps, runs, canManage,
}: {
  state: TagCellState
  tagId: string
  tagName: string
  language: string
  sequenceId?: string
  steps?: number
  runs?: number
  canManage: boolean
}) {
  if (state === 'na') {
    return <span aria-label="No aplica" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
  }
  if (state === 'falta') {
    return canManage
      ? <WriteButton tagId={tagId} language={language} />
      : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--accent-coral)' }}>
          <AlertTriangle size={12} aria-hidden /> Falta
        </span>
      )
  }
  // Vacía (el caso normal de un hueco real: los triggers la crean sin pasos).
  if (state === 'incompleta') {
    const label = `${tagName}, ${langLabel(language)}: sin pasos, no envía nada todavía`
    return canManage
      ? (
        <Link href={`/emails/${sequenceId}`} title="Sin pasos: no envía nada todavía" aria-label={`${label}. Escribir`} style={WRITE_STYLE}>
          <Pencil size={12} aria-hidden /> Escribir
        </Link>
      )
      : (
        <span role="img" aria-label={label} title="Sin pasos: no envía nada todavía"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--accent-coral)' }}>
          <AlertTriangle size={12} aria-hidden /> Falta
        </span>
      )
  }

  const running = runs && runs > 0 ? ` · ${runs} en curso` : ''
  const count = `${steps ?? 0} ${steps === 1 ? 'correo' : 'correos'}`
  const meta = {
    lista:       { Icon: Check, color: 'var(--accent-green)', text: 'Lista',    visible: `${count}${running}`, title: `${count}${running}` },
    desactivada: { Icon: Pause, color: 'var(--text-muted)',   text: 'Pausada',  visible: `Pausada${running}`,  title: `Desactivada: tiene ${count} pero no envía${running}` },
  }[state]

  const label = `${tagName}, ${langLabel(language)}: ${meta.text}. ${meta.title}`
  const style = { ...CELL_LINK, color: meta.color, border: '1px solid transparent', padding: '4px 8px' }
  const body = (
    <>
      <meta.Icon size={12} aria-hidden />
      <span style={STATUS_TEXT}>{meta.visible}</span>
    </>
  )

  // Las secuencias de etiqueta no tienen agente: el detalle responde 404 al rol
  // agent, así que ahí el estado se ve pero no es un enlace.
  if (!canManage) {
    return <span role="img" title={meta.title} aria-label={label} style={style}>{body}</span>
  }
  return (
    <Link href={`/emails/${sequenceId}`} title={meta.title} aria-label={`${label}. Editar`} style={style}>
      {body}
    </Link>
  )
}

// Correos obligatorios por etiqueta: una secuencia por etiqueta y por idioma que
// el equipo atiende. El panel existe para que el HUECO se vea — el disparo es
// silencioso por diseño (mandar en otro idioma sería peor que no mandar), así
// que sin esta vista nadie se enteraría de que los leads en inglés no reciben
// nada.
export function TagSequencesPanel({ coverage, canManage }: TagSequencesPanelProps) {
  const { languages, rows, missing } = tagMatrix(coverage)

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

  const columnsTemplate = `minmax(120px, 1.5fr) repeat(${languages.length}, minmax(88px, 1fr))`
  const rowStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: columnsTemplate, alignItems: 'center', columnGap: '8px',
    padding: '8px 12px',
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', marginBottom: '14px',
      }}>
        <div>
          {missing > 0 && (
            <div role="status" style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '7px 12px', borderRadius: '8px', fontSize: '12px',
              color: 'var(--accent-coral)',
              background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-coral) 25%, transparent)',
            }}>
              <AlertTriangle size={13} aria-hidden />
              {missing === 1
                ? 'Falta 1 versión por completar: esos leads no reciben nada.'
                : `Faltan ${missing} versiones por completar: esos leads no reciben nada.`}
            </div>
          )}
        </div>
        {canManage && <TagSequencesImportTools coverage={coverage} />}
      </div>

      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', overflowX: 'auto',
      }}>
        <div role="table" aria-label="Correos por etiqueta e idioma" style={{ minWidth: `${120 + languages.length * 96 + 24}px` }}>
          <div role="row" style={{
            ...rowStyle, borderBottom: '1px solid var(--border-subtle)',
            fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
          }}>
            <span role="columnheader">Etiqueta</span>
            {languages.map(l => (
              <span key={l} role="columnheader" style={{ textAlign: 'center' }}>{langLabel(l)}</span>
            ))}
          </div>

          {rows.map(({ tag, cells, sequenceIds }, i) => {
            const chip = tagChipStyle(tag.color)
            const slots = coverage.find(c => c.tag.id === tag.id)!.slots
            return (
              <div
                key={tag.id}
                role="row"
                style={{ ...rowStyle, borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}
              >
                <span role="rowheader" style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                    color: chip.color, background: chip.background, border: chip.border,
                  }}>
                    {tag.name}
                  </span>
                  {tag.description && (
                    <InfoHint label={`Qué es ${tag.name}`}>{tag.description}</InfoHint>
                  )}
                  {!tag.requiresSequence && (
                    <InfoHint label={`${tag.name} ya no es obligatoria`}>
                      Esta etiqueta ya no está marcada como obligatoria. Conserva las secuencias
                      que ya tenía, pero no exige versión en cada idioma.
                    </InfoHint>
                  )}
                </span>
                {languages.map(l => {
                  const seq = slots.find(s => s.language === l)?.sequence ?? null
                  return (
                    <span key={l} role="cell" style={{ display: 'flex', justifyContent: 'center' }}>
                      <Cell
                        state={cells[l]}
                        tagId={tag.id}
                        tagName={tag.name}
                        language={l}
                        sequenceId={sequenceIds[l]}
                        steps={seq?.stepCount}
                        runs={seq?.activeRunCount}
                        canManage={canManage}
                      />
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
