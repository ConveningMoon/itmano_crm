'use client'

import Link from 'next/link'
import type { EmailSequence } from '@/lib/data/email-sequences'
import type { SequenceMetrics } from '@/lib/services/email-metrics'
import { groupByFolder, type Folder } from '@/lib/data/folders'
import { FolderGroup, FolderPicker } from '@/components/dashboard/folders'
import { SequenceListActions } from './sequence-list-actions'

// ─── Tabla de secuencias ──────────────────────────────────────────────────────
//
// Era parte de page.tsx. Se movió a un componente de cliente porque agrupar en
// carpetas necesita estado en el navegador (plegar, mover); la página sigue
// haciendo TODO el fetch y esto sólo recibe props ya resueltas.
//
// Las carpetas son personales: la página pasa las de quien mira. Un elemento
// que no esté en ninguna cae en "Sin carpeta", y borrar una carpeta no borra
// nada de lo que contiene.

// Una sola definición de columnas para la cabecera y las filas: si divergen, la
// tabla se desalinea sin que nada falle.
const GRID_COLUMNS = '2fr 96px 56px 64px 76px 76px 72px 72px 72px 72px 88px 148px'
const GRID_MIN_WIDTH = '1210px'

const HEADERS = [
  'Nombre',
  'Idioma',
  'Pasos',
  'Canales',
  'Runs activos',
  'Enviados',
  'Click rate',
  'Reply rate',
  'Bounce rate',
  'Unsub rate',
  'Estado',
  'Acciones',
]

// Mismos criterios que la tarjeta del detalle (email-metrics-card): un 0% no se
// pinta de color —no hay nada que celebrar ni que alarmar— y rebotes o bajas por
// encima del umbral sano se marcan en coral.
function rateColor(value: number, opts: { alertOver?: number; color: string }): string {
  if (opts.alertOver !== undefined && value > opts.alertOver) return 'var(--accent-coral)'
  return value === 0 ? 'var(--text-muted)' : opts.color
}

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_COLOR: Record<string, string> = {
  es: 'var(--accent-gold)',
  en: 'var(--accent-blue)',
  pt: 'var(--accent-teal)',
}

interface Props {
  sequences:    EmailSequence[]
  /** sequenceId → métricas, ya batcheadas por el servidor. */
  metrics:      Record<string, SequenceMetrics | undefined>
  isSuperAdmin: boolean
  /** Carpetas de quien mira. Vacío = la lista se ve plana, como antes. */
  folders:      Folder[]
}

export function SequencesTable({ sequences, metrics, isSuperAdmin, folders }: Props) {
  const grouped = groupByFolder(sequences, folders)

  const folderOf = new Map<string, string>()
  for (const f of folders) for (const id of f.itemIds) folderOf.set(id, f.id)

  function renderRow(seq: EmailSequence, i: number) {
    const m = metrics[seq.id]
    return (
      <div
        key={seq.id}
        className="seq-row"
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_COLUMNS,
          padding: '14px 20px',
          borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
          alignItems: 'center',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Name + tenant + channel list */}
        <div>
          <Link
            href={`/emails/${seq.id}`}
            style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
          >
            {seq.name}
          </Link>
          <div style={{ marginTop: '2px' }}>
            <span style={{
              fontSize: '10px', padding: '1px 7px', borderRadius: '4px',
              background: 'var(--bg-elevated)', color: 'var(--text-muted)',
            }}>
              {seq.agentName ?? 'Toda la agencia'}
            </span>
          </div>
          {isSuperAdmin && seq.tenantName && (
            <div style={{ marginTop: '2px' }}>
              <span style={{
                fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
              }}>
                {seq.tenantName}
              </span>
            </div>
          )}
          {seq.channels.length > 0 && (
            <div style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {seq.channels.map(ch => ch.name).join(', ')}
            </div>
          )}
        </div>

        {/* Language */}
        <span style={{
          fontSize: '11px', fontWeight: 500,
          color: LANG_COLOR[seq.language] ?? 'var(--text-muted)',
          background: `${LANG_COLOR[seq.language] ?? 'var(--text-muted)'}18`,
          padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.04em', width: 'fit-content',
        }}>
          {LANG_LABEL[seq.language] ?? seq.language}
        </span>

        {/* Steps */}
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {seq.stepCount}
        </span>

        {/* Channels count */}
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {seq.channels.length}
        </span>

        {/* Active runs */}
        <span style={{
          fontSize: '13px', fontWeight: 500,
          color: seq.activeRunCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)',
        }}>
          {seq.activeRunCount}
        </span>

        {/* Métricas de envío — las mismas que la tarjeta del detalle.
            El open rate no está a propósito: Apple Mail precarga los
            píxeles y lo infla (ver CLAUDE.md). */}
        <span style={{ fontSize: '13px', fontWeight: 500, color: (m?.totalSends ?? 0) > 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
          {m?.totalSends ?? 0}
          {m && m.uniqueLeads > 0 && (
            <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '1px' }}>
              {m.uniqueLeads} {m.uniqueLeads === 1 ? 'lead' : 'leads'}
            </span>
          )}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.clickRate ?? 0, { color: 'var(--accent-blue)' }) }}>
          {m?.clickRate ?? 0}%
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.replyRate ?? 0, { color: 'var(--accent-green)' }) }}>
          {m?.replyRate ?? 0}%
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.bounceRate ?? 0, { alertOver: 5, color: 'var(--text-secondary)' }) }}>
          {m?.bounceRate ?? 0}%
        </span>
        <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.unsubscribeRate ?? 0, { alertOver: 3, color: 'var(--text-secondary)' }) }}>
          {m?.unsubscribeRate ?? 0}%
        </span>

        {/* Status */}
        <span style={{
          fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.06em', textTransform: 'uppercase', width: 'fit-content',
          color: seq.active ? 'var(--accent-green)' : 'var(--text-muted)',
          background: seq.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
        }}>
          {seq.active ? 'Activa' : 'Inactiva'}
        </span>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <FolderPicker
            kind="sequence"
            itemId={seq.id}
            folders={folders}
            currentFolderId={folderOf.get(seq.id) ?? null}
            label={seq.name}
          />
          <SequenceListActions
            sequenceId={seq.id}
            sequenceName={seq.name}
            active={seq.active}
            activeRunCount={seq.activeRunCount}
          />
        </div>
      </div>
    )
  }

  // La tabla creció con las métricas: en pantallas estrechas se desplaza
  // de lado en vez de aplastar las columnas.
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: GRID_MIN_WIDTH }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: GRID_COLUMNS,
          padding: '10px 20px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          marginBottom: '10px',
        }}>
          {HEADERS.map(h => (
            <span key={h} style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {h}
            </span>
          ))}
        </div>

        {grouped.folders.map(f => (
          <FolderGroup key={f.id} folder={f} count={f.items.length}>
            {f.items.map(renderRow)}
          </FolderGroup>
        ))}

        {folders.length > 0 && grouped.loose.length > 0 && (
          <div style={{
            fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            margin: '18px 0 8px 2px',
          }}>
            Sin carpeta
          </div>
        )}

        {grouped.loose.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            {grouped.loose.map(renderRow)}
          </div>
        )}
      </div>
    </div>
  )
}
