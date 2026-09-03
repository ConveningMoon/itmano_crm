'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, Pencil, Archive, ArchiveRestore, Trash2, Plus, Code2, Copy, Check,
} from 'lucide-react'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import { LANGUAGE_CONFIG } from '@/lib/config'
import { CATEGORY_LABELS } from '@/lib/newsletters/category'
import type { NewsletterEdition, NewsletterStatus } from '@/lib/data/newsletters'
import type { NewsletterTotals, EditionStats } from '@/lib/data/newsletter-stats'
import { ModalShell } from '@/components/motion/modal-shell'
import {
  archiveEdition, restoreEdition, unpublishEdition, deleteEdition,
  getNewsletterIntegrationPrompt,
} from './actions'

// Pantalla única de la newsletter: tira de totales, aviso de secuencia vacía y
// la tabla de ediciones con sus acciones. Sustituye a series-list.tsx +
// serie/[id]/series-detail.tsx — con una sola newsletter por tenant, ya no hay
// nada que listar antes de llegar a las ediciones.
//
// Las acciones por fila y el modal de "Integración" vienen movidos tal cual de
// series-detail.tsx: mismo comportamiento, mismo ConfirmDialog, adaptados a
// que la action de integración ya no recibe el id de una serie.

interface Props {
  editions:      NewsletterEdition[]
  stats:         { totals: NewsletterTotals; byEdition: Record<string, EditionStats> }
  tenantSlug:    string
  /** id de la secuencia "Newsletter", para el aviso. null si no se pudo crear. */
  sequenceId:    string | null
  /** true si esa secuencia no tiene ningún paso todavía. */
  sequenceEmpty: boolean
  myUserId:      string
  isAgent:       boolean
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

export function EditionsList({
  editions, stats, tenantSlug, sequenceId, sequenceEmpty, myUserId, isAgent,
}: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Prompt de integración: se pide al abrirlo, no al cargar la página — casi
  // nadie lo necesita y armarlo lee tres filas más.
  const [integration, setIntegration] = useState<string | null>(null)
  const [showIntegration, setShowIntegration] = useState(false)
  const [copied, setCopied] = useState(false)
  // Un solo diálogo a la vez: qué se está confirmando, sobre qué fila.
  const [confirm, setConfirm] = useState<
    | { kind: 'archive_edition'; edition: NewsletterEdition }
    | { kind: 'delete_edition';  edition: NewsletterEdition }
    | null
  >(null)

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

      {/* Cabecera */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Newsletter
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Contenido editorial con captación de suscriptores, publicado con tu marca.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link
            href="/newsletters/nueva"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', border: 'none', textDecoration: 'none',
            }}
          >
            <Plus size={14} />
            Nueva edición
          </Link>
          <button
            className="nl-ghost"
            style={GHOST_BTN}
            disabled={pending}
            onClick={() => {
              setShowIntegration(true)
              if (integration !== null) return
              setError(null)
              start(async () => {
                const res = await getNewsletterIntegrationPrompt()
                if (res.ok) setIntegration(res.data.prompt)
                else { setError(res.error); setShowIntegration(false) }
              })
            }}
          >
            <Code2 size={13} /> Integración
          </button>
        </div>
      </div>

      {error && (
        <p style={{
          fontSize: '13px', color: 'var(--accent-coral)', margin: '0 0 16px',
          padding: '10px 14px', borderRadius: '8px', background: 'rgba(201,123,107,0.08)',
        }}>
          {error}
        </p>
      )}

      {/* Tira de totales */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px', marginBottom: '20px',
      }}>
        <StatTile label="Suscriptores" value={stats.totals.subscribers} />
        <StatTile label="Publicadas" value={stats.totals.published} />
        <StatTile label="Borradores" value={stats.totals.drafts} />
        <StatTile label="Vistas" value={stats.totals.views} />
      </div>

      {/* Aviso de secuencia vacía */}
      {sequenceEmpty && sequenceId && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '20px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
        }}>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Tu secuencia <strong style={{ color: 'var(--text-secondary)' }}>Newsletter</strong> todavía
            no tiene correos, así que quien se suscriba no recibirá nada.{' '}
            <Link href={`/emails/${sequenceId}`} style={{ color: 'var(--accent-gold)' }}>
              Añadir el primero →
            </Link>
          </p>
        </div>
      )}

      {/* Ediciones */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {editions.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '28px 20px', margin: 0, textAlign: 'center' }}>
            Todavía no hay ninguna edición.
          </p>
        ) : (
          <div>
            {editions.map(ed => (
              <EditionRow
                key={ed.id}
                edition={ed}
                tenantSlug={tenantSlug}
                edStats={stats.byEdition[ed.id]}
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

      <ModalShell open={showIntegration} onClose={() => { setShowIntegration(false); setCopied(false) }} maxWidth={720}>
        <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: '6px', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Opciones de integración
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
            Copia esto y pásaselo a quien lleva tu web —persona o IA—. Lleva el contrato
            completo: el formulario de suscripción y, si lo quieres, cómo mostrar las
            ediciones en tu propio sitio. Se genera con los datos de hoy, así que
            vuelve aquí si cambias la secuencia vinculada.
          </p>

          {integration === null ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Preparando…</p>
          ) : (
            <>
              <pre style={{
                margin: 0, padding: '14px', maxHeight: '46vh', overflow: 'auto',
                background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                borderRadius: '8px', fontSize: '11.5px', lineHeight: 1.6,
                color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {integration}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                <button
                  type="button"
                  className="nl-ghost"
                  style={GHOST_BTN}
                  onClick={() => { setShowIntegration(false); setCopied(false) }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(integration).then(
                      () => { setCopied(true); setTimeout(() => setCopied(false), 2000) },
                      () => setError('Tu navegador no dejó copiar. Selecciona el texto y cópialo a mano.'),
                    )
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '6px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '8px',
                    background: 'var(--accent-gold)', color: 'var(--bg-base)',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
              </div>
            </>
          )}
        </div>
      </ModalShell>

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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '10px',
      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function EditionRow({
  edition, tenantSlug, edStats, canWrite, pending,
  onUnpublish, onRestore, onArchive, onDelete,
}: {
  edition:     NewsletterEdition
  tenantSlug:  string
  edStats:     EditionStats | undefined
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
    ? hostedNewsletterUrl(tenantSlug, edition.slug)
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
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {CATEGORY_LABELS[edition.category]}
          </span>
          {edition.authorName && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {edition.authorName}
            </span>
          )}
          {lang && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lang.label}</span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {edition.publishedAt
              ? `Publicada el ${fmtDate(edition.publishedAt)}`
              : `Creada el ${fmtDate(edition.createdAt)}`}
          </span>
          {edStats && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              · {edStats.views} {edStats.views === 1 ? 'vista' : 'vistas'} · {edStats.subscribers} {edStats.subscribers === 1 ? 'suscriptor' : 'suscriptores'}
            </span>
          )}
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
