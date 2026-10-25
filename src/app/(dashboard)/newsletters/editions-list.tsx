'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, Pencil, Archive, ArchiveRestore, Trash2, Plus, Code2, Copy, Check,
  Users, FileCheck2, FilePen, Eye, EyeOff,
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
import { FechaLocal } from '@/components/ui/local-date'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { RowMenu } from '@/components/ui/row-menu'
import { DataBlock, DataHead, DataScope, type DataColumn } from '@/components/ui/data-table'

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

const STATUS_LABEL: Record<NewsletterStatus, { label: string; tone: 'mute' | 'green' | 'coral' }> = {
  draft:     { label: 'Borrador',  tone: 'mute' },
  published: { label: 'Publicada', tone: 'green' },
  archived:  { label: 'Archivada', tone: 'coral' },
}

function fmtDate(iso: string) {
  return <FechaLocal fecha={iso} locale="es" opciones={{ day: 'numeric', month: 'short', year: 'numeric' }} />
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onCancel} className="btn btn-ghost">Cancelar</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {pending && <span className="loading-spinner" aria-hidden="true" />}
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
  // Edición cuya acción está en curso: su fila muestra el spinner.
  const [busyId, setBusyId] = useState<string | null>(null)
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
  function run(id: string, fn: () => Promise<{ ok: true; data: null } | { ok: false; error: string }>) {
    setError(null)
    setBusyId(id)
    start(async () => {
      const res = await fn()
      setBusyId(null)
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
      {/* Cabecera */}
      <PageHeader
        title="Newsletter"
        description="Contenido editorial con captación de suscriptores, publicado con tu marca."
        actions={
          <>
            <Link href="/newsletters/nueva" className="btn btn-primary btn-cta">
              <Plus size={14} />
              Nueva edición
            </Link>
            <button
              className="btn btn-ghost"
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
              <Code2 size={14} /> Integración
            </button>
          </>
        }
      />

      {error && (
        <p style={{
          fontSize: '13px', color: 'var(--accent-coral)', margin: '0 0 16px',
          padding: '10px 14px', borderRadius: '8px', background: 'rgba(201,123,107,0.08)',
        }}>
          {error}
        </p>
      )}

      {/* Tira de totales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
        <StatCard label="Suscriptores" value={stats.totals.subscribers} icon={<Users size={16} />} tone="var(--accent-blue)" />
        <StatCard label="Publicadas"   value={stats.totals.published}   icon={<FileCheck2 size={16} />} tone="var(--accent-green)" />
        <StatCard label="Borradores"   value={stats.totals.drafts}      icon={<FilePen size={16} />} tone="var(--text-secondary)" />
        <StatCard label="Vistas"       value={stats.totals.views}       icon={<Eye size={16} />} tone="var(--accent-teal)" />
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
      {editions.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed var(--border-hover)',
          borderRadius: '12px', padding: '48px 20px', textAlign: 'center',
          fontSize: '13px', color: 'var(--text-secondary)',
        }}>
          Todavía no hay ninguna edición.
        </div>
      ) : (
        <DataScope cols={COLS} colsMd={COLS_MD} colsSm={COLS_SM}>
          <DataHead columns={COLUMNS} />
          <DataBlock>
            {editions.map(ed => (
              <EditionRow
                key={ed.id}
                edition={ed}
                tenantSlug={tenantSlug}
                edStats={stats.byEdition[ed.id]}
                canWrite={!isAgent || ed.createdByUserId === myUserId}
                pending={pending}
                busy={busyId === ed.id}
                onUnpublish={() => run(ed.id, () => unpublishEdition(ed.id))}
                onRestore={() => run(ed.id, () => restoreEdition(ed.id))}
                onArchive={() => setConfirm({ kind: 'archive_edition', edition: ed })}
                onDelete={() => setConfirm({ kind: 'delete_edition', edition: ed })}
              />
            ))}
          </DataBlock>
        </DataScope>
      )}

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
        onConfirm={() => confirm?.kind === 'archive_edition' && run(confirm.edition.id, () => archiveEdition(confirm.edition.id))}
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
                  className="btn btn-ghost"
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
                  className="btn btn-primary"
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
        onConfirm={() => confirm?.kind === 'delete_edition' && run(confirm.edition.id, () => deleteEdition(confirm.edition.id))}
      />
    </>
  )
}

const COLS    = 'minmax(0, 3fr) 112px 80px 104px 44px'
const COLS_MD = 'minmax(0, 2.6fr) 112px 104px 44px'
const COLS_SM = 'minmax(0, 1fr) 112px 44px'

const COLUMNS: DataColumn[] = [
  { label: 'Edición' },
  { label: 'Estado' },
  { label: 'Vistas', right: true, hideMd: true, hideSm: true },
  { label: 'Suscriptores', right: true, hideSm: true },
  { label: '' },
]

function EditionRow({
  edition, tenantSlug, edStats, canWrite, pending, busy,
  onUnpublish, onRestore, onArchive, onDelete,
}: {
  edition:     NewsletterEdition
  tenantSlug:  string
  edStats:     EditionStats | undefined
  canWrite:    boolean
  pending:     boolean
  busy:        boolean
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
  // Las dos firmas, en el mismo orden que la página pública. Desde la 113
  // cualquiera de las dos puede faltar, así que se filtra en vez de asumir
  // que hay una.
  const byline = [edition.authorName, edition.authorOrgName].filter(Boolean).join(' · ')

  return (
    <div className="dt-grid dt-row" aria-busy={busy || undefined} style={busy ? { opacity: 0.6 } : undefined}>
      <div className="dt-cell-main">
        <Link href={`/newsletters/${edition.id}`} className="dt-title">{edition.title}</Link>
        <div className="dt-meta">
          <span>{CATEGORY_LABELS[edition.category]}</span>
          {byline && <span>{byline}</span>}
          {lang && <span>{lang.label}</span>}
          <span>
            {edition.publishedAt
              ? <>Publicada el {fmtDate(edition.publishedAt)}</>
              : <>Creada el {fmtDate(edition.createdAt)}</>}
          </span>
          {edition.aiGenerated && <span>Generada con IA</span>}
        </div>
      </div>

      <span className="pill pill-dot" data-tone={cfg.tone} style={{ justifySelf: 'start' }}>{cfg.label}</span>

      <span className="dt-num dt-hide-md dt-hide-sm dt-r">{edStats?.views ?? 0}</span>
      <span className="dt-num dt-hide-sm dt-r">{edStats?.subscribers ?? 0}</span>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
        {busy && <span className="loading-spinner" role="status" aria-label="Procesando" />}
        <RowMenu
          label={edition.title}
          entries={[
            { type: 'item', label: 'Editar', icon: <Pencil size={14} />, href: `/newsletters/${edition.id}` },
            ...(publicUrl
              ? [{ type: 'item' as const, label: 'Ver publicada', icon: <ExternalLink size={14} />, href: publicUrl, external: true }]
              : []),
            ...(canWrite ? [{ type: 'separator' as const }] : []),
            ...(canWrite && edition.status === 'published'
              ? [{ type: 'item' as const, label: 'Despublicar', icon: <EyeOff size={14} />, disabled: pending, onSelect: onUnpublish }]
              : []),
            ...(canWrite && edition.status !== 'archived'
              ? [{ type: 'item' as const, label: 'Archivar', icon: <Archive size={14} />, tone: 'danger' as const, disabled: pending, onSelect: onArchive }]
              : []),
            ...(canWrite && edition.status === 'archived'
              ? [
                  { type: 'item' as const, label: 'Restaurar', icon: <ArchiveRestore size={14} />, disabled: pending, onSelect: onRestore },
                  { type: 'item' as const, label: 'Eliminar', icon: <Trash2 size={14} />, tone: 'danger' as const, disabled: pending, onSelect: onDelete },
                ]
              : []),
          ]}
        />
      </div>
    </div>
  )
}
