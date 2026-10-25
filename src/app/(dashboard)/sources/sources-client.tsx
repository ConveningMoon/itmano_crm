'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus, X, Trash2, AlertTriangle, ExternalLink, Eye, Users, Mail, UserRound, ChevronDown, Magnet, CalendarDays, FileText } from 'lucide-react'
import type { ChannelWithMetrics, ChannelType } from '@/lib/data/channels'
import { groupByFolder, type Folder } from '@/lib/data/folders'
import { FolderGroup, NewFolderButton, useFolderMenu } from '@/components/dashboard/folders'
import { resolveChannelPageUrl, type TenantPageInfo } from '@/lib/sources/page-link'
import { STATUS_COPY, MEASUREMENT_COPY, type SourceHealth } from '@/lib/sources/health'
import { ModalShell } from '@/components/motion/modal-shell'
import { ButtonMenu, RowMenu } from '@/components/ui/row-menu'
import { DataBlock, DataHead, DataScope, type DataColumn } from '@/components/ui/data-table'
import { RefreshingPill } from '@/components/ui/loading-indicator'

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

const WINDOWS = [
  { value: 7,  label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

const CHANNEL_TYPE_COLORS: Record<ChannelType, string> = {
  lead_magnet:   'var(--accent-gold)',
  event:         'var(--accent-teal)',
  contact_form:  'var(--accent-blue)',
  manychat_flow: 'var(--accent-green)',
  manual:        'var(--text-muted)',
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
// Antes cada fuente era una tarjeta. Con más de un puñado de fuentes la
// cuadrícula obligaba a recorrer la pantalla entera para comparar dos números
// que deberían estar en la misma columna, y una fuente ocupaba lo que ahora
// ocupan seis. La fila es la misma información con la lectura de /emails.
//
// Una sola definición de columnas para la cabecera y las filas (DataScope): si
// divergen, la tabla se desalinea sin que nada falle. Las acciones viven en un
// menú ⋯; la acción principal es el clic en la fila.
const COLS    = 'minmax(0, 2.6fr) minmax(0, 1.5fr) 72px 96px 72px 96px 44px'
const COLS_MD = 'minmax(0, 2.4fr) minmax(0, 1.4fr) 72px 96px 96px 44px'
const COLS_SM = 'minmax(0, 1fr) 80px 44px'

const COLUMNS: DataColumn[] = [
  { label: 'Fuente' },
  { label: 'Salud', hideSm: true },
  { label: 'Envíos', right: true, hideSm: true },
  { label: 'Leads nuevos', right: true },
  { label: 'Vistas', right: true, hideMd: true, hideSm: true },
  { label: 'Conversión', right: true, hideSm: true },
  { label: '' },
]

function ChannelRow({ ch, health, tenant, folders, folderId }: {
  ch:       ChannelWithMetrics
  health?:  SourceHealth
  tenant?:  TenantPageInfo
  folders:  Folder[]
  /** Carpeta en la que está para ESTE usuario, o null. */
  folderId: string | null
}) {
  const { navigate, pending: navPending } = useCardNavigation()
  const [noPage, setNoPage] = useState(false)
  const typeColor = CHANNEL_TYPE_COLORS[ch.channelType]
  const typeLabel = CHANNEL_TYPE_LABELS[ch.channelType]
  const pageUrl   = resolveChannelPageUrl(ch, tenant)
  const folderMenu = useFolderMenu('source', ch.id, folders, folderId)

  return (
    <div
      className="dt-grid dt-row"
      data-clickable
      role="link"
      tabIndex={0}
      aria-busy={folderMenu.pending || undefined}
      onClick={() => navigate(`/sources/${ch.slug}`)}
      // Sólo Enter sobre la fila misma: sobre el botón ⋯ hijo debe abrir el menú.
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/sources/${ch.slug}`) }}
      style={folderMenu.pending ? { opacity: 0.6 } : undefined}
    >
      <NavLoadingOverlay show={navPending} />

      {/* Fuente: tipo, nombre, public id, agente y si tiene secuencia */}
      <div className="dt-cell-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span className="pill" style={{ '--tone': typeColor } as React.CSSProperties}>{typeLabel}</span>
          <span className="dt-title">{ch.name}</span>
          {!ch.active && <span className="pill" data-tone="mute">Inactivo</span>}
        </div>
        <div className="dt-meta">
          <span style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>{ch.publicId}</span>
          <span title="Agente responsable"><UserRound size={12} />{ch.agentName ?? 'Toda la agencia'}</span>
          {ch.emailSequenceId && (
            <span title="Secuencia de emails activa" style={{ color: 'var(--accent-teal)' }}>
              <Mail size={12} />Secuencia
            </span>
          )}
        </div>
      </div>

      {/* Dos semáforos, dos problemas distintos: el del FORMULARIO (qué tan
          bien califica lo que pregunta) y el de la FUENTE (si está reportando
          lo que hace falta para medirla). Se arreglan en sitios distintos —
          uno cambiando preguntas, el otro pegando un script — así que
          juntarlos escondía uno detrás del otro. */}
      <div className="dt-hide-sm" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {health && health.status !== 'sin_envios'
          ? [STATUS_COPY[health.status], MEASUREMENT_COPY[health.measurement]].map((b, i) => (
              <span key={i} className="pill pill-dot" title={`${b.label} — ${b.what}\n\n${b.why}`}
                style={{ '--tone': HEALTH_TONE[b.tone], cursor: 'help' } as React.CSSProperties}>
                {b.label}
              </span>
            ))
          : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>}
      </div>

      {/* Envíos y leads son cosas distintas: quien ya era lead y vuelve a llenar
          un formulario suma envío pero no adquisición. */}
      <span className="dt-num dt-hide-sm dt-r">{ch.metrics.submissionsInWindow}</span>

      <span className="dt-num dt-r" style={{ textAlign: 'right' }}>
        {ch.metrics.leadsInWindow}
        <span className="dt-sub">{ch.metrics.leadsTotal} en total</span>
      </span>

      {/* Sin vistas no hay denominador: un 0% afirmaría que nadie convirtió. */}
      <span className="dt-num dt-hide-md dt-hide-sm dt-r">{ch.metrics.pageViewsInWindow || '—'}</span>
      <span className="dt-num dt-hide-sm dt-r" style={{ color: ch.metrics.conversionRate ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
        {ch.metrics.conversionRate === null ? '—' : `${ch.metrics.conversionRate}%`}
      </span>

      {/* El menú y sus modales no navegan a la fila: cada clic es para sí mismo.
          Los modales cuelgan de aquí (no de la fila) porque React propaga los
          clics por el árbol, y el del overlay llegaría al onClick de la fila. */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <NoPageModal
          open={noPage}
          channelName={ch.name}
          managedByItmano={tenant?.managedByItmano === true}
          onClose={() => setNoPage(false)}
        />
        {folderMenu.modal}
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
      background: 'rgba(0,0,0,0.55)',
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
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
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
      background: 'rgba(0,0,0,0.55)',
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
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
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
      background: 'rgba(0,0,0,0.55)',
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
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
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
      background: 'rgba(0,0,0,0.55)',
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
            background: 'rgba(224,64,64,0.08)',
            border: '1px solid rgba(224,64,64,0.2)',
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
            <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
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
                color: '#fff',
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
  const typeColor   = CHANNEL_TYPE_COLORS[ch.channelType]
  const typeLabel   = CHANNEL_TYPE_LABELS[ch.channelType]
  const archivedStr = ch.archivedAt
    ? <FechaLocal fecha={ch.archivedAt} locale="es" opciones={{ day: '2-digit', month: 'short', year: 'numeric' }} />
    : '—'

  return (
    <div className="dt-grid dt-row">
      <div className="dt-cell-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span className="pill" style={{ '--tone': typeColor } as React.CSSProperties}>{typeLabel}</span>
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
  windowDays:       number
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

export function SourcesClient({ health, channels, archivedChannels, windowDays, isSuperAdmin, tenants, myAgentId, tenantPages, folders }: Props) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  // La ventana cambia la URL y vuelve a consultar la base: la transición deja
  // el contenido anterior en pantalla y muestra «Actualizando…» hasta que llega.
  const [windowPending, startWindow] = useTransition()

  function setWindow(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', String(days))
    startWindow(() => router.push(`/sources?${params.toString()}`))
  }

  const isArchivedTab = activeTab === 'archived'
  const display = isArchivedTab
    ? archivedChannels
    : activeTab === 'all'
      ? channels
      : channels.filter(c => c.channelType === activeTab)

  const tenantName = (id: string) => tenants.find(t => t.id === id)?.name

  // Las carpetas sólo agrupan en "Todos". Los tabs por tipo siguen haciendo
  // exactamente lo de antes —filtrar— y muestran los resultados sueltos: quien
  // pregunta "¿qué eventos tengo?" quiere la lista, no volver a abrir carpetas.
  const grouped     = groupByFolder(display, folders)
  const foldersView = activeTab === 'all'
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
        tenant={tenantPages[ch.tenantId]}
        folders={folders}
        folderId={folderOf.get(ch.id) ?? null}
      />
    )
  }

  const empty = (
    <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
      {isArchivedTab ? 'No hay fuentes archivadas.' : 'No hay fuentes en esta categoría.'}
    </div>
  )

  return (
    <div style={{ position: 'relative' }}>
      <RefreshingPill show={windowPending} />

      {/* Tipo de fuente (izquierda) y ventana de tiempo (derecha) */}
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

        <div className="segmented" style={{ marginBottom: '8px' }} role="group" aria-label="Ventana de tiempo">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              aria-pressed={windowDays === w.value}
            >
              {w.label}
            </button>
          ))}
        </div>
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
