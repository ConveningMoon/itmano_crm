'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Plus, X, Trash2, AlertTriangle, ExternalLink, Eye, Users, Mail, UserRound, ChevronDown, Magnet,
  CalendarDays, FileText, Search, Link2, Check, Copy, MessageCircle, PenLine,
  type LucideIcon,
} from 'lucide-react'
import type { ChannelWithMetrics, ChannelType } from '@/lib/data/channels'
import { groupByFolder, type Folder } from '@/lib/data/folders'
import { FolderGroup, NewFolderButton, useFolderMenu } from '@/components/dashboard/folders'
import { resolveChannelPageUrl, type TenantPageInfo } from '@/lib/sources/page-link'
import type { SourceHealth } from '@/lib/sources/health'
import { combinedHealth, filterChannels } from '@/lib/sources/list-view'
import { Sparkline } from '@/components/charts/sparkline'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/motion/modal-shell'
import { ButtonMenu, RowMenu } from '@/components/ui/row-menu'
import { DataBlock, DataHead, DataScope, type DataColumn } from '@/components/ui/data-table'

// Color de cada semáforo de salud (token, no hex): lo consume .pill vía --tone.
const HEALTH_TONE: Record<'ok' | 'warn' | 'bad' | 'mute', string> = {
  ok:   'var(--accent-green)',
  warn: 'var(--accent-gold)',
  bad:  'var(--accent-coral)',
  mute: 'var(--text-muted)',
}
import { createLeadMagnet, createEvent, createContactForm, deleteChannelPermanently } from './actions'
import { FormSection } from '@/components/ui/form-section'
import { NavLoadingOverlay, useCardNavigation } from '@/components/ui/nav-loading'
import { IntegrationPromptModal } from './integration-prompt-modal'
import { FechaLocal } from '@/components/ui/local-date'

type TabValue = ChannelType | 'all' | 'archived'

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

// Un icono por tipo, en un cuadro dorado único: el tipo se lee por la forma, no
// por un color distinto por categoría.
const CHANNEL_TYPE_ICONS: Record<ChannelType, LucideIcon> = {
  lead_magnet:   Magnet,
  event:         CalendarDays,
  contact_form:  FileText,
  manychat_flow: MessageCircle,
  manual:        PenLine,
}

const TAB_FILTERS: Array<{ value: TabValue; label: string }> = [
  // manual / manychat_flow are excluded page-wide (no form behind them) — they are
  // already filtered out by the base query (getChannelsWithMetrics).
  { value: 'all',          label: 'Todos' },
  { value: 'lead_magnet',  label: 'Lead Magnets' },
  { value: 'event',        label: 'Eventos' },
  { value: 'contact_form', label: 'Formularios' },
  { value: 'archived',     label: 'Archivados' },
]

// ─── Página de la fuente ──────────────────────────────────────────────────────

// Aviso cuando la fuente todavía no tiene página. El camino para arreglarlo es
// distinto según quién construye la página, así que el mensaje también.
function NoPageModal({ open, channelName, managedByItmano, onClose }: {
  open:            boolean
  channelName:     string
  managedByItmano: boolean
  onClose:         () => void
}) {
  const strong = { color: 'var(--text-primary)', fontWeight: 500 } as const
  return (
    <ModalShell open={open} onClose={onClose} maxWidth={440}>
      <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertTriangle size={16} style={{ color: 'var(--accent-gold)' }} />
          Página sin configurar
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={strong}>{channelName}</strong> todavía no tiene una página que abrir.
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {managedByItmano
            ? <>La página de esta fuente la conecta ITMANO, pero su link aún no está registrado. Abre la
                fuente, pulsa <strong style={strong}>Editar</strong> y pega el
                link en <strong style={strong}>Link de la página</strong>.</>
            : <>Abre la fuente, entra a la sección <strong style={strong}>Página</strong> y
                configúrala. Cuando la publiques, esta opción la abrirá directamente.</>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-primary">Entendido</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Tabla de fuentes ─────────────────────────────────────────────────────────
//
// Una sola definición de columnas para la cabecera y las filas (DataScope): si
// divergen, la tabla se desalinea sin que nada falle. Las métricas completas
// (vistas, envíos, otras ventanas) viven en Dashboard → Fuentes; aquí la fila
// sólo ayuda a gestionar. La acción principal es el clic en la fila.
const COLS    = '34px minmax(0, 2fr) minmax(0, 150px) 84px 84px 72px 112px'
const COLS_MD = '34px minmax(0, 2fr) minmax(0, 150px) 84px 72px 112px'
const COLS_SM = 'minmax(0, 1fr) 72px 44px'

const COLUMNS: DataColumn[] = [
  { label: '', hideSm: true },
  { label: 'Fuente' },
  { label: 'Salud', hideSm: true },
  { label: 'Tendencia', hideMd: true, hideSm: true },
  { label: 'Leads', right: true },
  { label: 'Conv.', right: true, hideSm: true },
  { label: '' },
]

// Mensaje efímero de una copia: el menú se cierra al elegir, así que la
// confirmación vive en la fila.
type CopyNote = { ok: boolean; text: string }

function ChannelRow({ ch, health, trend, tenant, folders, folderId }: {
  ch:       ChannelWithMetrics
  health?:  SourceHealth
  /** Leads por barra en las últimas 4 semanas; vacío si no hay serie. */
  trend:    number[]
  tenant?:  TenantPageInfo
  folders:  Folder[]
  /** Carpeta en la que está para ESTE usuario, o null. */
  folderId: string | null
}) {
  const { navigate, pending: navPending } = useCardNavigation()
  const [noPage, setNoPage] = useState(false)
  const [note, setNote] = useState<CopyNote | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const Icon      = CHANNEL_TYPE_ICONS[ch.channelType]
  const typeLabel = CHANNEL_TYPE_LABELS[ch.channelType]
  const pageUrl   = resolveChannelPageUrl(ch, tenant)
  const folderMenu = useFolderMenu('source', ch.id, folders, folderId)
  const hc = combinedHealth(health)

  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current) }, [])

  function flash(next: CopyNote) {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    setNote(next)
    noteTimer.current = setTimeout(() => setNote(null), 2200)
  }

  // El portapapeles puede no existir (http) o negarse (permisos): en ambos casos
  // se avisa en vez de fingir que se copió.
  async function copy(text: string, okText: string) {
    try {
      await navigator.clipboard.writeText(text)
      flash({ ok: true, text: okText })
    } catch {
      flash({ ok: false, text: 'No se pudo copiar' })
    }
  }

  function copyLink() {
    if (!pageUrl) { setNoPage(true); return }
    void copy(pageUrl, 'Enlace copiado')
  }

  const copyState = note ? (note.ok ? 'copied' : 'error') : undefined
  const CopyIcon  = note ? (note.ok ? Check : AlertTriangle) : Link2

  return (
    <div
      className="dt-grid dt-row"
      data-clickable
      role="link"
      tabIndex={0}
      aria-busy={folderMenu.pending || undefined}
      onClick={() => navigate(`/sources/${ch.slug}`)}
      // Sólo Enter sobre la fila misma: sobre un botón hijo debe activarlo a él.
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/sources/${ch.slug}`) }}
      style={folderMenu.pending ? { opacity: 0.6 } : undefined}
    >
      <NavLoadingOverlay show={navPending} />

      <span className="fu-tile dt-hide-sm" aria-hidden="true"><Icon size={16} /></span>

      {/* Fuente: nombre y, debajo, tipo, agente y si tiene secuencia */}
      <div className="dt-cell-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span className="dt-title">{ch.name}</span>
          {!ch.active && <span className="pill" data-tone="mute">Pausada</span>}
          {note && (
            <span
              className="pill"
              data-tone={note.ok ? 'green' : 'coral'}
              role="status"
              style={{ flex: 'none' }}
            >
              {note.ok ? <Check size={11} aria-hidden="true" /> : <AlertTriangle size={11} aria-hidden="true" />}
              {note.text}
            </span>
          )}
        </div>
        <div className="dt-meta">
          <span>{typeLabel}</span>
          <span title="Agente responsable"><UserRound size={12} />{ch.agentName ?? 'Toda la agencia'}</span>
          {ch.emailSequenceId && (
            <span title="Secuencia de emails activa" style={{ color: 'var(--accent-teal)' }}>
              <Mail size={12} />Secuencia
            </span>
          )}
        </div>
      </div>

      {/* Un solo semáforo: manda el peor de FORMULARIO y MEDICIÓN. El detalle de
          los dos va en el ⓘ, que no debe navegar a la fila (el popover vive en
          un portal y React propaga sus eventos por el árbol). */}
      <div className="dt-hide-sm">
        {hc ? (
          <span className="fu-health" style={{ '--tone': HEALTH_TONE[hc.tone] } as React.CSSProperties}>
            <span className="fu-dot" aria-hidden="true" />
            <span className="fu-health-label">{hc.label}</span>
            <span
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex' }}
            >
              <InfoHint label={`Detalle de salud de ${ch.name}`}>
                {hc.lines.map((l, i) => (
                  <div key={i} style={i > 0 ? { marginTop: '8px' } : undefined}>
                    <strong style={{ fontWeight: 500 }}>{l.label}</strong>{' — '}{l.what}
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{l.why}</div>
                  </div>
                ))}
              </InfoHint>
            </span>
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
        )}
      </div>

      <div className="dt-hide-md dt-hide-sm">
        {trend.length > 1 && ch.metrics.leadsInWindow > 0
          ? <Sparkline values={trend} />
          : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>}
      </div>

      <span className="dt-num dt-r" style={{ textAlign: 'right' }}>
        {ch.metrics.leadsInWindow}
        <span className="dt-sub">{ch.metrics.leadsTotal} en total</span>
      </span>

      {/* Sin vistas no hay denominador: un 0% afirmaría que nadie convirtió. */}
      <span className="dt-num dt-hide-sm dt-r" style={{ color: ch.metrics.conversionRate ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
        {ch.metrics.conversionRate === null ? '—' : `${ch.metrics.conversionRate}%`}
      </span>

      {/* Los botones y el menú no navegan a la fila: cada clic o tecla es para sí
          mismo. Los modales cuelgan de aquí (no de la fila) porque React propaga
          los clics por el árbol, y el del overlay llegaría al onClick de la fila. */}
      <div
        className="fu-actions"
        onClick={e => e.stopPropagation()}
      >
        <NoPageModal
          open={noPage}
          channelName={ch.name}
          managedByItmano={tenant?.managedByItmano === true}
          onClose={() => setNoPage(false)}
        />
        {folderMenu.modal}
        <button
          type="button"
          className="icon-btn dt-hide-sm"
          data-state={copyState}
          title={note ? note.text : 'Copiar enlace'}
          aria-label={`Copiar enlace de ${ch.name}`}
          onClick={copyLink}
        >
          <CopyIcon size={15} />
        </button>
        {pageUrl ? (
          <a
            className="icon-btn dt-hide-sm"
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir página"
            aria-label={`Abrir página de ${ch.name}`}
          >
            <ExternalLink size={15} />
          </a>
        ) : (
          <button
            type="button"
            className="icon-btn dt-hide-sm"
            title="Abrir página"
            aria-label={`Abrir página de ${ch.name}`}
            onClick={() => setNoPage(true)}
          >
            <ExternalLink size={15} />
          </button>
        )}
        <RowMenu
          label={ch.name}
          entries={[
            { type: 'item', label: 'Abrir detalle', icon: <Eye size={14} />, onSelect: () => navigate(`/sources/${ch.slug}`) },
            // El parámetro es `channelId`: con `channel` la lista lo ignoraba y el
            // enlace abría /leads sin filtrar, sin ninguna señal de que fallara.
            { type: 'item', label: 'Ver leads', icon: <Users size={14} />, href: `/leads?channelId=${ch.id}` },
            pageUrl
              ? { type: 'item', label: 'Abrir página', icon: <ExternalLink size={14} />, href: pageUrl, external: true }
              : { type: 'item', label: 'Abrir página', icon: <ExternalLink size={14} />, onSelect: () => setNoPage(true) },
            // En pantallas estrechas el botón de copiar se oculta: el menú lo conserva.
            { type: 'item', label: 'Copiar enlace', icon: <Link2 size={14} />, onSelect: copyLink },
            { type: 'item', label: 'Copiar ID', icon: <Copy size={14} />, onSelect: () => { void copy(ch.publicId, 'ID copiado') } },
            { type: 'separator' },
            folderMenu.entry,
          ]}
        />
      </div>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

const BTN_GHOST: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '13px',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
}

type AgentOption = { id: string; name: string; tenantId: string }

// ─── Agent selector (organizational owner; "Toda la agencia" = round-robin) ─────

function AgentSelect({ agents, value, onChange, locked }: {
  agents:   AgentOption[]
  value:    string
  onChange: (v: string) => void
  /**
   * El que crea es un agente: la fuente es suya y el selector queda fijo en su
   * nombre, sin "Toda la agencia". Es sólo la pantalla — quien lo hace cumplir
   * es el servidor, que reescribe el propietario pase lo que pase por aquí.
   */
  locked:   boolean
}) {
  // Si su propia fila no está en la lista (inactiva, o filtrada por tenant), se
  // sigue mostrando: un desplegable vacío parecería un error de la app.
  const opciones = locked
    ? (agents.some(a => a.id === value) ? agents.filter(a => a.id === value) : [{ id: value, name: 'Tú', tenantId: '' }])
    : agents

  return (
    <div>
      <label style={LABEL}>Agente</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={locked}
        style={{ ...INPUT, appearance: 'none', cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.65 : 1 }}
      >
        {!locked && <option value="">Toda la agencia</option>}
        {opciones.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
        {locked
          ? 'Los leads de esta fuente se atribuyen a ti. Las fuentes para toda la agencia las crea el propietario del equipo.'
          : 'Los leads de esta fuente se atribuyen a este agente. "Toda la agencia" los atribuye al propietario del equipo.'}
      </div>
    </div>
  )
}

// ─── Lead Magnet modal ─────────────────────────────────────────────────────────

function LeadMagnetModal({ onClose, isSuperAdmin, tenants, agents, myAgentId }: {
  onClose:     () => void
  isSuperAdmin: boolean
  tenants:     Array<{ id: string; name: string }>
  agents:      AgentOption[]
  myAgentId:   string | null
}) {
  const [name,     setName]     = useState('')
  const [slug,     setSlug]     = useState('')
  const [lpUrl,    setLpUrl]    = useState('')
  const [fileUrl,  setFileUrl]  = useState('')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [agentId,  setAgentId]  = useState(myAgentId ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<{ publicId: string; slug: string; sequenceId: string; integrationPrompt: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createLeadMagnet({
        name, slug: slug || undefined, lpUrl: lpUrl || undefined, fileUrl: fileUrl || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, sequenceId: res.sequenceId, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Lead Magnet creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'color-mix(in srgb, var(--bg-base) 70%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Lead Magnet
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Guía para Primeros Compradores" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional — se genera del nombre)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="guia-primeros-compradores" />
          </div>
          </FormSection>

          <FormSection title="Material y atribución">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} locked={myAgentId !== null} />
          <div>
            <label style={LABEL}>URL de la landing page <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={lpUrl} onChange={e => setLpUrl(e.target.value)} style={INPUT} placeholder="https://..." type="url" />
          </div>
          <div>
            <label style={LABEL}>URL del recurso descargable <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} style={INPUT} placeholder="https://drive.google.com/..." type="url" />
          </div>
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Lead Magnet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event modal ───────────────────────────────────────────────────────────────

function EventModal({ onClose, isSuperAdmin, tenants, agents, myAgentId }: {
  onClose:      () => void
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
  agents:       AgentOption[]
  myAgentId:    string | null
}) {
  const [name,      setName]      = useState('')
  const [slug,      setSlug]      = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location,  setLocation]  = useState('')
  const [tenantId,  setTenantId]  = useState(tenants[0]?.id ?? '')
  const [agentId,   setAgentId]   = useState(myAgentId ?? '')
  const [error,     setError]     = useState<string | null>(null)
  const [result,    setResult]    = useState<{ publicId: string; slug: string; integrationPrompt: string } | null>(null)
  const [pending,   startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    if (!eventDate) { setError('La fecha del evento es obligatoria'); return }
    startTransition(async () => {
      const res = await createEvent({
        name, slug: slug || undefined, eventDate, location: location || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Evento creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'color-mix(in srgb, var(--bg-base) 70%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Evento
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre del evento *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Open House Virginia Beach Jun 2026" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="open-house-vb-jun-2026" />
          </div>
          </FormSection>

          <FormSection title="Detalles del evento">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} locked={myAgentId !== null} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Fecha del evento <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <input value={eventDate} onChange={e => setEventDate(e.target.value)} style={INPUT} type="date" />
            </div>
            <div>
              <label style={LABEL}>Ubicación <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opc.)</span></label>
              <input value={location} onChange={e => setLocation(e.target.value)} style={INPUT} placeholder="Virginia Beach, VA" />
            </div>
          </div>
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || !eventDate || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || !eventDate || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Evento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Contact Form (Web) modal ──────────────────────────────────────────────────

function ContactFormModal({ onClose, isSuperAdmin, tenants, agents, myAgentId }: {
  onClose:      () => void
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
  agents:       AgentOption[]
  myAgentId:    string | null
}) {
  const [name,     setName]     = useState('')
  const [slug,     setSlug]     = useState('')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [agentId,  setAgentId]  = useState(myAgentId ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<{ publicId: string; slug: string; integrationPrompt: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  const visibleAgents = isSuperAdmin ? agents.filter(a => a.tenantId === tenantId) : agents

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createContactForm({
        name, slug: slug || undefined,
        agentId: agentId || null,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, integrationPrompt: res.integrationPrompt })
    })
  }

  if (result) {
    return (
      <IntegrationPromptModal
        title="Formulario creado"
        prompt={result.integrationPrompt}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'color-mix(in srgb, var(--bg-base) 70%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Nuevo Formulario Web
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <FormSection title="Básico" first>
          {isSuperAdmin && (
            <div>
              <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <select value={tenantId} onChange={e => { setTenantId(e.target.value); setAgentId('') }} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>Nombre del formulario *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Contáctanos — Página de inicio" autoFocus />
          </div>
          <div>
            <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
            <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="contactanos-home" />
          </div>
          </FormSection>

          <FormSection title="Agente">
          <AgentSelect agents={visibleAgents} value={agentId} onChange={setAgentId} locked={myAgentId !== null} />
          </FormSection>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
              {pending ? 'Creando…' : 'Crear Formulario'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirmation modal (permanent delete) ───────────────────────────────

function DeleteChannelModal({ channel, onClose, onDeleted }: {
  channel:   ChannelWithMetrics
  onClose:   () => void
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText]   = useState('')
  const [error,       setError]         = useState<string | null>(null)
  const [pending,     startTransition]  = useTransition()
  const canDelete  = confirmText.trim().toUpperCase() === 'ELIMINAR'
  const typeLabel  = CHANNEL_TYPE_LABELS[channel.channelType]
  const leadCount  = channel.metrics.leadsTotal

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteChannelPermanently(channel.id)
      if (!res.ok) { setError(res.error); return }
      onDeleted()
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'color-mix(in srgb, var(--bg-base) 70%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '480px',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} style={{ color: 'var(--accent-coral)' }} />
            Eliminar permanentemente
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Vas a eliminar <strong style={{ color: 'var(--text-primary)' }}>{channel.name}</strong> ({typeLabel}).
          </div>

          <div style={{
            padding: '12px 14px',
            background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent-coral) 20%, transparent)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            Este source tiene <strong style={{ color: 'var(--text-primary)' }}>{leadCount} lead{leadCount === 1 ? '' : 's'} atribuido{leadCount === 1 ? '' : 's'}</strong>. Al eliminarlo, los leads se conservan pero pierden la atribución a este source. Esta acción no se puede deshacer.
          </div>

          <div>
            <label style={LABEL}>Escribe <code style={{ color: 'var(--accent-coral)', fontFamily: 'monospace', textTransform: 'none', letterSpacing: 0 }}>ELIMINAR</code> para confirmar</label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              style={INPUT}
              placeholder="ELIMINAR"
              autoFocus
            />
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '6px 10px', background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button
              onClick={handleDelete}
              disabled={!canDelete || pending}
              style={{
                padding: '9px 18px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--bg-base)',
                background: 'var(--accent-coral)',
                border: 'none',
                borderRadius: '8px',
                cursor: (!canDelete || pending) ? 'default' : 'pointer',
                opacity: (!canDelete || pending) ? 0.5 : 1,
              }}
            >
              {pending ? 'Eliminando…' : 'Eliminar permanentemente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fila de fuente archivada ────────────────────────────────────────────────

const ARCHIVED_COLS    = 'minmax(0, 2.6fr) 110px 140px 110px 44px'
const ARCHIVED_COLS_SM = 'minmax(0, 1fr) 110px 44px'

const ARCHIVED_COLUMNS: DataColumn[] = [
  { label: 'Fuente' },
  { label: 'Estado' },
  { label: 'Archivado', hideSm: true },
  { label: 'Leads', right: true, hideSm: true },
  { label: '' },
]

function ArchivedChannelRow({ ch, isSuperAdmin, tenantName, canDelete }: {
  ch:           ChannelWithMetrics
  isSuperAdmin: boolean
  tenantName?:  string
  /**
   * El borrado permanente sigue siendo de owner/super: huerfaniza los leads de
   * esa fuente. Un agente archiva las suyas, pero aquí sólo vería un botón que
   * la action va a rechazar.
   */
  canDelete:    boolean
}) {
  const router = useRouter()
  const [showDelete, setShowDelete] = useState(false)
  const typeLabel   = CHANNEL_TYPE_LABELS[ch.channelType]
  const archivedStr = ch.archivedAt
    ? <FechaLocal fecha={ch.archivedAt} locale="es" opciones={{ day: '2-digit', month: 'short', year: 'numeric' }} />
    : '—'

  return (
    <div className="dt-grid dt-row">
      <div className="dt-cell-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span className="pill" data-tone="mute">{typeLabel}</span>
          <span className="dt-title">{ch.name}</span>
          {isSuperAdmin && tenantName && <span className="pill" data-tone="gold">{tenantName}</span>}
        </div>
        <div className="dt-meta">
          <span style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>{ch.publicId}</span>
        </div>
      </div>

      <span className="pill" data-tone="mute" style={{ justifySelf: 'start' }}>Archivado</span>

      <span className="dt-hide-sm" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{archivedStr}</span>

      <span className="dt-num dt-hide-sm dt-r" style={{ textAlign: 'right' }}>
        {ch.metrics.leadsTotal}
        <span className="dt-sub">atribuido{ch.metrics.leadsTotal === 1 ? '' : 's'}</span>
      </span>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {canDelete && (
          <RowMenu
            label={ch.name}
            entries={[
              { type: 'item', label: 'Eliminar definitivamente', icon: <Trash2 size={14} />, tone: 'danger', onSelect: () => setShowDelete(true) },
            ]}
          />
        )}
        {showDelete && (
          <DeleteChannelModal
            channel={ch}
            onClose={() => setShowDelete(false)}
            onDeleted={() => { setShowDelete(false); router.refresh() }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Acciones de la página (crear fuente / carpeta) ──────────────────────────

interface CreateProps {
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
  agents:       AgentOption[]
  /** Ver `Props.myAgentId`. */
  myAgentId:    string | null
}

// Va en el encabezado de la página (PageHeader). Antes eran cuatro botones sueltos
// sobre la lista; ahora son «Nueva carpeta» y un único menú «Nueva fuente».
export function SourcesActions({ isSuperAdmin, tenants, agents, myAgentId }: CreateProps) {
  const router = useRouter()
  const [openModal, setOpenModal] = useState<'lead_magnet' | 'event' | 'contact_form' | null>(null)

  const modalProps = {
    onClose: () => { setOpenModal(null); router.refresh() },
    isSuperAdmin, tenants, agents, myAgentId,
  }

  return (
    <>
      {openModal === 'lead_magnet'  && <LeadMagnetModal  {...modalProps} />}
      {openModal === 'event'        && <EventModal       {...modalProps} />}
      {openModal === 'contact_form' && <ContactFormModal {...modalProps} />}

      <NewFolderButton kind="source" />
      <ButtonMenu
        trigger={<><Plus size={14} />Nueva fuente<ChevronDown size={14} /></>}
        entries={[
          { type: 'item', label: 'Lead magnet', icon: <Magnet size={14} />,       onSelect: () => setOpenModal('lead_magnet') },
          { type: 'item', label: 'Evento',      icon: <CalendarDays size={14} />, onSelect: () => setOpenModal('event') },
          { type: 'item', label: 'Formulario',  icon: <FileText size={14} />,     onSelect: () => setOpenModal('contact_form') },
        ]}
      />
    </>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  /** Diagnóstico por canal — vacío mientras no haya envíos. */
  health:           Record<string, SourceHealth>
  channels:         ChannelWithMetrics[]
  archivedChannels: ChannelWithMetrics[]
  /** channelId → leads por barra de las últimas 4 semanas. */
  trends:           Record<string, number[]>
  isSuperAdmin:     boolean
  tenants:          Array<{ id: string; name: string }>
  /**
   * agents.id del que mira, sólo para el rol 'agent'. Cuando llega, las fuentes
   * que cree son suyas: el selector de agente queda fijo y sin "Toda la agencia".
   */
  myAgentId:        string | null
  /** tenantId → slug + si ITMANO administra sus páginas. */
  tenantPages:      Record<string, TenantPageInfo>
  /** Carpetas de QUIEN MIRA (migración 115). Cada usuario tiene las suyas. */
  folders:          Folder[]
}

export function SourcesClient({ health, channels, archivedChannels, trends, isSuperAdmin, tenants, myAgentId, tenantPages, folders }: Props) {
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [query, setQuery] = useState('')

  const isArchivedTab = activeTab === 'archived'
  const searching = query.trim() !== ''
  const display = filterChannels(
    isArchivedTab ? archivedChannels : channels,
    { type: isArchivedTab ? 'all' : activeTab, query },
  )

  const tenantName = (id: string) => tenants.find(t => t.id === id)?.name

  // Las carpetas sólo agrupan en "Todos" y sin búsqueda. Los tabs por tipo y la
  // búsqueda muestran los resultados sueltos: quien pregunta "¿qué eventos tengo?"
  // o busca un nombre quiere la lista, no volver a abrir carpetas.
  const grouped     = groupByFolder(display, folders)
  const foldersView = activeTab === 'all' && !searching
  // channelId → carpeta en la que está, para pintar el selector de cada fila.
  const folderOf = new Map<string, string>()
  for (const f of folders) for (const id of f.itemIds) folderOf.set(id, f.id)

  function countOf(tab: TabValue) {
    if (tab === 'archived') return archivedChannels.length
    if (tab === 'all') return channels.length
    return channels.filter(c => c.channelType === tab).length
  }

  function renderRow(ch: ChannelWithMetrics) {
    return (
      <ChannelRow
        key={ch.id}
        ch={ch}
        health={health[ch.id]}
        trend={trends[ch.id] ?? []}
        tenant={tenantPages[ch.tenantId]}
        folders={folders}
        folderId={folderOf.get(ch.id) ?? null}
      />
    )
  }

  const empty = (
    <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
      {searching
        ? `Ninguna fuente coincide con «${query.trim()}».`
        : isArchivedTab ? 'No hay fuentes archivadas.' : 'No hay fuentes en esta categoría.'}
    </div>
  )

  return (
    <div>
      {/* Tipo de fuente (izquierda) y búsqueda (derecha), en una sola fila */}
      <div className="toolbar" style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: '20px' }}>
        <div className="filter-tabs" role="tablist">
          {TAB_FILTERS.map(t => (
            <button
              key={t.value}
              role="tab"
              aria-selected={activeTab === t.value}
              onClick={() => setActiveTab(t.value)}
              className="filter-tab"
            >
              {t.label}
              <span className="filter-tab-count">{countOf(t.value)}</span>
            </button>
          ))}
        </div>

        <label className="fu-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar fuente"
            aria-label="Buscar fuente por nombre o ID"
          />
        </label>
      </div>

      {/* Filas. La tabla no se aplasta en pantallas estrechas: oculta columnas. */}
      {display.length === 0 && (isArchivedTab || !foldersView || folders.length === 0) ? empty : isArchivedTab ? (
        <DataScope cols={ARCHIVED_COLS} colsMd={ARCHIVED_COLS} colsSm={ARCHIVED_COLS_SM}>
          <DataHead columns={ARCHIVED_COLUMNS} />
          <DataBlock>
            {display.map(ch => (
              <ArchivedChannelRow
                key={ch.id}
                ch={ch}
                isSuperAdmin={isSuperAdmin}
                tenantName={tenantName(ch.tenantId)}
                canDelete={myAgentId === null}
              />
            ))}
          </DataBlock>
        </DataScope>
      ) : (
        <DataScope cols={COLS} colsMd={COLS_MD} colsSm={COLS_SM}>
          <p className="toolbar-meta" style={{ margin: '0 2px 8px' }}>Leads y conversión: últimas 4 semanas.</p>
          <DataHead columns={COLUMNS} />

          {foldersView ? (
            <>
              {grouped.folders.map(f => (
                <FolderGroup key={f.id} folder={f} count={f.items.length}>
                  <DataBlock>{f.items.map(renderRow)}</DataBlock>
                </FolderGroup>
              ))}

              {folders.length > 0 && grouped.loose.length > 0 && (
                <div className="menu-label" style={{ padding: '14px 2px 8px' }}>Sin carpeta</div>
              )}
              {grouped.loose.length > 0 && <DataBlock>{grouped.loose.map(renderRow)}</DataBlock>}
              {grouped.loose.length === 0 && folders.length === 0 && empty}
            </>
          ) : (
            <DataBlock>{display.map(renderRow)}</DataBlock>
          )}
        </DataScope>
      )}
    </div>
  )
}
