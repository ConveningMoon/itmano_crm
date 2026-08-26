'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ExternalLink, Pencil, Archive, ArchiveRestore, Trash2, Plus,
} from 'lucide-react'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import { LANGUAGE_CONFIG } from '@/lib/config'
import type { NewsletterSeries, NewsletterEdition, NewsletterStatus } from '@/lib/data/newsletters'
import type { EmailSequence } from '@/lib/data/email-sequences'
import { ModalShell } from '@/components/motion/modal-shell'
import { SeriesModal } from '../../series-modal'
import {
  archiveSeries, restoreSeries, deleteSeries,
  archiveEdition, restoreEdition, unpublishEdition, deleteEdition,
} from '../../actions'

// Ediciones de una serie + gestión de la serie. Es la pantalla que faltaba: sin
// ella no había forma de abrir, retirar ni eliminar nada de lo ya creado.
//
// Todo lo destructivo pasa por confirmación y por el mismo camino de dos pasos
// que /sources: archivar primero, eliminar después. El servidor lo vuelve a
// exigir (deleteSeries / deleteEdition) — un check de UI que el servidor no
// repite no es un check.

interface AgentOption { id: string; name: string }

interface Props {
  series:          NewsletterSeries
  editions:        NewsletterEdition[]
  sequences:       EmailSequence[]
  agents:          AgentOption[]
  tenantSlug:      string
  canManageSeries: boolean
  myUserId:        string
  isAgent:         boolean
}

const STATUS_LABEL: Record<NewsletterStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Borrador',  color: 'var(--text-muted)',    bg: 'var(--bg-overlay)' },
  published: { label: 'Publicada', color: 'var(--accent-green)',  bg: 'rgba(107,163,104,0.12)' },
  archived:  { label: 'Archivada', color: 'var(--accent-coral)',  bg: 'rgba(201,123,107,0.12)' },
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

const GHOST_BTN: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '6px 12px', fontSize: '12px', fontWeight: 500,
  background: 'var(--bg-surface)', color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
}

/** Confirmación de un paso irreversible o casi. `detail` explica el efecto. */
function ConfirmDialog({
  open, title, detail, confirmLabel, pending, onCancel, onConfirm, danger,
}: {
  open: boolean
  title: string
  detail: React.ReactNode
  confirmLabel: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
  danger?: boolean
}) {
  return (
    <ModalShell open={open} onClose={onCancel} maxWidth={420}>
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '10px' }}>
          {title}
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          {detail}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: danger ? 'var(--accent-coral)' : 'var(--accent-gold)',
              color: 'var(--bg-base)', border: 'none',
              cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

export function SeriesDetail({
  series, editions, sequences, agents, tenantSlug, canManageSeries, myUserId, isAgent,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Un solo diálogo a la vez: qué se está confirmando, sobre qué fila.
  const [confirm, setConfirm] = useState<
    | { kind: 'archive_series' }
    | { kind: 'delete_series' }
    | { kind: 'archive_edition'; edition: NewsletterEdition }
    | { kind: 'delete_edition';  edition: NewsletterEdition }
    | null
  >(null)

  const archived  = series.archivedAt !== null
  const publicUrl = tenantSlug ? hostedNewsletterUrl(tenantSlug, series.slug) : null

  /** Corre una action y refresca; deja el error a la vista si falla. */
  function run(fn: () => Promise<{ ok: true; data: null } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.ok) {
        setConfirm(null)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <>
      <style>{`
        .nl-row { transition: background 0.15s; }
        .nl-row:hover { background: var(--bg-overlay); }
        .nl-ghost:hover { border-color: var(--border-hover) !important; color: var(--text-primary) !important; }
        .nl-danger:hover { border-color: var(--accent-coral) !important; color: var(--accent-coral) !important; }
        @media (prefers-reduced-motion: reduce) { .nl-row { transition: none !important; } }
      `}</style>

      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/newsletters"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} />
          Newsletters
        </Link>
      </div>

      {/* Cabecera de la serie */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', marginBottom: '24px',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {series.name}
            </h1>
            <span style={{
              fontSize: '10px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: archived ? 'var(--accent-coral)' : 'var(--accent-green)',
              background: archived ? 'rgba(201,123,107,0.12)' : 'rgba(107,163,104,0.12)',
              padding: '2px 8px', borderRadius: '10px',
            }}>
              {archived ? 'Archivada' : 'Activa'}
            </span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {series.subscriberCount} {series.subscriberCount === 1 ? 'suscriptor' : 'suscriptores'}
            {' · '}
            {editions.length} {editions.length === 1 ? 'edición' : 'ediciones'}
            {' · '}
            {series.emailSequenceName ? `Secuencia: ${series.emailSequenceName}` : 'Sin secuencia vinculada'}
          </p>
          {archived && series.archivedAt && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
              Archivada el {fmtDate(series.archivedAt)}. No aparece en la web ni acepta suscripciones nuevas.
            </p>
          )}
        </div>

        {canManageSeries && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="nl-ghost" style={GHOST_BTN} onClick={() => setEditing(true)}>
              <Pencil size={13} /> Editar
            </button>
            {archived ? (
              <>
                <button className="nl-ghost" style={GHOST_BTN} onClick={() => run(() => restoreSeries(series.id))}>
                  <ArchiveRestore size={13} /> Restaurar
                </button>
                <button className="nl-danger" style={GHOST_BTN} onClick={() => setConfirm({ kind: 'delete_series' })}>
                  <Trash2 size={13} /> Eliminar
                </button>
              </>
            ) : (
              <button className="nl-danger" style={GHOST_BTN} onClick={() => setConfirm({ kind: 'archive_series' })}>
                <Archive size={13} /> Archivar
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p style={{
          fontSize: '13px', color: 'var(--accent-coral)', margin: '0 0 16px',
          padding: '10px 14px', borderRadius: '8px', background: 'rgba(201,123,107,0.08)',
        }}>
          {error}
        </p>
      )}

      {publicUrl && !archived && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '20px',
          }}
        >
          <ExternalLink size={12} />
          Ver página pública
        </a>
      )}

      {/* Ediciones */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Ediciones
          </span>
          <Link href="/newsletters/nueva" style={{ ...GHOST_BTN, textDecoration: 'none' }} className="nl-ghost">
            <Plus size={13} /> Nueva edición
          </Link>
        </div>

        {editions.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '28px 20px', margin: 0, textAlign: 'center' }}>
            Esta serie todavía no tiene ediciones.
          </p>
        ) : (
          <div>
            {editions.map(ed => (
              <EditionRow
                key={ed.id}
                edition={ed}
                seriesSlug={series.slug}
                tenantSlug={tenantSlug}
                canWrite={!isAgent || ed.createdByUserId === myUserId}
                pending={pending}
                onUnpublish={() => run(() => unpublishEdition(ed.id))}
                onRestore={() => run(() => restoreEdition(ed.id))}
                onArchive={() => setConfirm({ kind: 'archive_edition', edition: ed })}
                onDelete={() => setConfirm({ kind: 'delete_edition', edition: ed })}
              />
            ))}
          </div>
        )}
      </div>

      <SeriesModal
        key={series.id}
        open={editing}
        onClose={() => setEditing(false)}
        sequences={sequences}
        agents={agents}
        series={series}
      />

      <ConfirmDialog
        open={confirm?.kind === 'archive_series'}
        title="Archivar serie"
        detail={<>
          <strong style={{ color: 'var(--text-primary)' }}>{series.name}</strong> saldrá de la web
          y dejará de aceptar suscripciones. Sus {editions.length} {editions.length === 1 ? 'edición' : 'ediciones'} y
          sus {series.subscriberCount} {series.subscriberCount === 1 ? 'suscriptor' : 'suscriptores'} se conservan,
          y puedes restaurarla cuando quieras.
        </>}
        confirmLabel="Archivar serie"
        pending={pending}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => archiveSeries(series.id))}
      />

      <ConfirmDialog
        open={confirm?.kind === 'delete_series'}
        title="Eliminar serie definitivamente"
        detail={<>
          Se elimina <strong style={{ color: 'var(--text-primary)' }}>{series.name}</strong> y
          con ella <strong style={{ color: 'var(--text-primary)' }}>
            sus {editions.length} {editions.length === 1 ? 'edición' : 'ediciones'}
          </strong>, publicadas incluidas. Esto no se puede deshacer.
          Los {series.subscriberCount} {series.subscriberCount === 1 ? 'suscriptor' : 'suscriptores'} se
          conservan como leads, sólo pierden la atribución a esta serie.
        </>}
        confirmLabel="Eliminar definitivamente"
        pending={pending}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => deleteSeries(series.id))}
      />

      <ConfirmDialog
        open={confirm?.kind === 'archive_edition'}
        title="Archivar edición"
        detail={confirm?.kind === 'archive_edition' ? <>
          <strong style={{ color: 'var(--text-primary)' }}>{confirm.edition.title}</strong> saldrá
          de la web. Su enlace público dejará de responder. Puedes restaurarla como borrador cuando quieras.
        </> : null}
        confirmLabel="Archivar edición"
        pending={pending}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'archive_edition' && run(() => archiveEdition(confirm.edition.id))}
      />

      <ConfirmDialog
        open={confirm?.kind === 'delete_edition'}
        title="Eliminar edición definitivamente"
        detail={confirm?.kind === 'delete_edition' ? <>
          Se elimina <strong style={{ color: 'var(--text-primary)' }}>{confirm.edition.title}</strong> con
          su texto, sus fuentes y su portada. Esto no se puede deshacer.
        </> : null}
        confirmLabel="Eliminar definitivamente"
        pending={pending}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.kind === 'delete_edition' && run(() => deleteEdition(confirm.edition.id))}
      />
    </>
  )
}

function EditionRow({
  edition, seriesSlug, tenantSlug, canWrite, pending,
  onUnpublish, onRestore, onArchive, onDelete,
}: {
  edition:     NewsletterEdition
  seriesSlug:  string
  tenantSlug:  string
  canWrite:    boolean
  pending:     boolean
  onUnpublish: () => void
  onRestore:   () => void
  onArchive:   () => void
  onDelete:    () => void
}) {
  const cfg = STATUS_LABEL[edition.status]
  const lang = LANGUAGE_CONFIG[edition.language as keyof typeof LANGUAGE_CONFIG]
  const publicUrl = tenantSlug && edition.status === 'published'
    ? hostedNewsletterUrl(tenantSlug, seriesSlug, edition.slug)
    : null

  return (
    <div
      className="nl-row"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '14px 20px', borderTop: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: '220px', flex: '1 1 auto' }}>
        <Link
          href={`/newsletters/${edition.id}`}
          style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
        >
          {edition.title}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '10px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: '10px',
          }}>
            {cfg.label}
          </span>
          {lang && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lang.label}</span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {edition.publishedAt
              ? `Publicada el ${fmtDate(edition.publishedAt)}`
              : `Creada el ${fmtDate(edition.createdAt)}`}
          </span>
          {edition.aiGenerated && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>· Generada con IA</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nl-ghost"
            style={{ ...GHOST_BTN, textDecoration: 'none' }}
          >
            <ExternalLink size={13} /> Ver
          </a>
        )}
        <Link href={`/newsletters/${edition.id}`} className="nl-ghost" style={{ ...GHOST_BTN, textDecoration: 'none' }}>
          <Pencil size={13} /> Editar
        </Link>

        {canWrite && edition.status === 'published' && (
          <button className="nl-ghost" style={GHOST_BTN} disabled={pending} onClick={onUnpublish}>
            Despublicar
          </button>
        )}
        {canWrite && edition.status !== 'archived' && (
          <button className="nl-danger" style={GHOST_BTN} disabled={pending} onClick={onArchive}>
            <Archive size={13} /> Archivar
          </button>
        )}
        {canWrite && edition.status === 'archived' && (
          <>
            <button className="nl-ghost" style={GHOST_BTN} disabled={pending} onClick={onRestore}>
              <ArchiveRestore size={13} /> Restaurar
            </button>
            <button className="nl-danger" style={GHOST_BTN} disabled={pending} onClick={onDelete}>
              <Trash2 size={13} /> Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
