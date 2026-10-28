'use client'

import Link from 'next/link'
import { AlertTriangle, ListOrdered, Play, Radio, UserRound } from 'lucide-react'
import type { EmailSequence } from '@/lib/data/email-sequences'
import type { SequenceMetrics } from '@/lib/services/email-metrics'
import { groupByFolder, type Folder } from '@/lib/data/folders'
import { FolderGroup } from '@/components/dashboard/folders'
import { DataBlock, DataHead, DataScope, type DataColumn } from '@/components/ui/data-table'
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
//
// Seis columnas en vez de doce. Pasos, canales y runs activos son datos de
// contexto y viven como iconos bajo el nombre; el rendimiento muestra click y
// reply como medidores, y rebote y bajas sólo cuando pasan su umbral sano.
// Todo el detalle de tasas sigue en la tarjeta de métricas del detalle.

const COLS    = 'minmax(0, 2.6fr) 96px 96px 96px minmax(0, 1.7fr) 44px'
const COLS_MD = 'minmax(0, 2.4fr) 96px 96px minmax(0, 1.5fr) 44px'
const COLS_SM = 'minmax(0, 1fr) 96px 44px'

const COLUMNS: DataColumn[] = [
  { label: 'Nombre' },
  { label: 'Idioma', hideMd: true },
  { label: 'Estado' },
  { label: 'Enviados', right: true, hideSm: true },
  { label: 'Rendimiento', hideSm: true },
  { label: '' },
]

// Umbrales sanos: por encima, la tasa deja de ser un dato y pasa a ser una alerta.
const BOUNCE_ALERT_OVER = 5
const UNSUB_ALERT_OVER  = 3

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_TONE: Record<string, string>  = { es: 'gold', en: 'blue', pt: 'teal' }

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

function RateMeter({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ minWidth: '56px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '5px' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}</span>
        <span className="dt-num" style={{ fontSize: '12px', color: value === 0 ? 'var(--text-muted)' : 'var(--text-primary)' }}>
          {value}%
        </span>
      </div>
      <div className="meter" style={{ '--tone': tone } as React.CSSProperties} aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.min(value, 100) / 100})` }} />
      </div>
    </div>
  )
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

  function renderRow(seq: EmailSequence) {
    const m = metrics[seq.id]
    const bounce = m?.bounceRate ?? 0
    const unsub  = m?.unsubscribeRate ?? 0
    const langTone = LANG_TONE[seq.language] ?? 'mute'
    const langLabel = LANG_LABEL[seq.language] ?? seq.language

    return (
      <div key={seq.id} className="dt-grid dt-row">
        {/* Nombre + contexto */}
        <div className="dt-cell-main">
          <Link href={`/emails/${seq.id}`} className="dt-title">{seq.name}</Link>
          <div className="dt-meta">
            <span className="dt-show-md pill" data-tone={langTone}>{langLabel}</span>
            <span title="Agente responsable"><UserRound size={12} />{seq.agentName ?? 'Toda la agencia'}</span>
            <span title="Pasos de la secuencia"><ListOrdered size={12} />{plural(seq.stepCount, 'paso', 'pasos')}</span>
            <span title={seq.channels.length > 0 ? seq.channels.map(ch => ch.name).join(', ') : 'Sin fuentes asociadas'}>
              <Radio size={12} />{plural(seq.channels.length, 'fuente', 'fuentes')}
            </span>
            {seq.activeRunCount > 0 && (
              <span title="Leads recorriendo la secuencia ahora" style={{ color: 'var(--accent-gold)' }}>
                <Play size={12} />{plural(seq.activeRunCount, 'activo', 'activos')}
              </span>
            )}
            {isSuperAdmin && seq.tenantName && <span className="pill" data-tone="gold">{seq.tenantName}</span>}
          </div>
        </div>

        {/* Idioma */}
        <span className="dt-hide-md pill" data-tone={langTone} style={{ justifySelf: 'start' }}>{langLabel}</span>

        {/* Estado */}
        <span className="pill pill-dot" data-tone={seq.active ? 'green' : 'mute'} style={{ justifySelf: 'start' }}>
          {seq.active ? 'Activa' : 'Inactiva'}
        </span>

        {/* Enviados — el open rate no está a propósito: Apple Mail precarga los
            píxeles y lo infla (ver CLAUDE.md). */}
        <div className="dt-hide-sm dt-r" style={{ textAlign: 'right' }}>
          <span className="dt-num" style={{ color: (m?.totalSends ?? 0) > 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
            {m?.totalSends ?? 0}
          </span>
          {m && m.uniqueLeads > 0 && <span className="dt-sub">{plural(m.uniqueLeads, 'lead', 'leads')}</span>}
        </div>

        {/* Rendimiento */}
        <div
          className="dt-hide-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}
          title={`Click ${m?.clickRate ?? 0}% · Reply ${m?.replyRate ?? 0}% · Rebote ${bounce}% · Bajas ${unsub}%`}
        >
          <RateMeter label="Click" value={m?.clickRate ?? 0} tone="var(--accent-blue)" />
          <RateMeter label="Reply" value={m?.replyRate ?? 0} tone="var(--accent-green)" />
          {bounce > BOUNCE_ALERT_OVER && (
            <span className="pill" data-tone="coral" title="Rebote por encima del umbral sano (5%)">
              <AlertTriangle size={11} />Rebote {bounce}%
            </span>
          )}
          {unsub > UNSUB_ALERT_OVER && (
            <span className="pill" data-tone="coral" title="Bajas por encima del umbral sano (3%)">
              <AlertTriangle size={11} />Bajas {unsub}%
            </span>
          )}
        </div>

        <SequenceListActions
          sequenceId={seq.id}
          sequenceName={seq.name}
          active={seq.active}
          activeRunCount={seq.activeRunCount}
          folders={folders}
          currentFolderId={folderOf.get(seq.id) ?? null}
        />
      </div>
    )
  }

  return (
    <DataScope cols={COLS} colsMd={COLS_MD} colsSm={COLS_SM}>
      <DataHead columns={COLUMNS} />

      {grouped.folders.map(f => (
        <FolderGroup key={f.id} folder={f} count={f.items.length}>
          <DataBlock>{f.items.map(renderRow)}</DataBlock>
        </FolderGroup>
      ))}

      {folders.length > 0 && grouped.loose.length > 0 && (
        <div className="menu-label" style={{ padding: '14px 2px 8px' }}>Sin carpeta</div>
      )}

      {grouped.loose.length > 0 && <DataBlock>{grouped.loose.map(renderRow)}</DataBlock>}
    </DataScope>
  )
}
