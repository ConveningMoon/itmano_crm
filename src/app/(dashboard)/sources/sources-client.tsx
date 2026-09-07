'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, X, Trash2, AlertTriangle, ExternalLink, Eye, Users } from 'lucide-react'
import type { ChannelWithMetrics, ChannelType } from '@/lib/data/channels'
import { groupByFolder, type Folder } from '@/lib/data/folders'
import { FolderGroup, FolderPicker, NewFolderButton } from '@/components/dashboard/folders'
import { resolveChannelPageUrl, type TenantPageInfo } from '@/lib/sources/page-link'
import { STATUS_COPY, MEASUREMENT_COPY, type SourceHealth } from '@/lib/sources/health'

const HEALTH_TONE: Record<'ok' | 'warn' | 'bad' | 'mute', { fg: string; bg: string }> = {
  ok:   { fg: 'var(--accent-green)',  bg: 'rgba(107,163,104,0.12)' },
  warn: { fg: 'var(--accent-gold)',   bg: 'rgba(201,169,110,0.14)' },
  bad:  { fg: 'var(--accent-coral)',  bg: 'rgba(201,123,107,0.14)' },
  mute: { fg: 'var(--text-muted)',    bg: 'var(--bg-overlay)' },
}
import { createLeadMagnet, createEvent, createContactForm, deleteChannelPermanently } from './actions'
import { FormSection } from '@/components/ui/form-section'
import { NavLoadingOverlay, useCardNavigation } from '@/components/ui/nav-loading'
import { IntegrationPromptModal } from './integration-prompt-modal'

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
function NoPageModal({ channelName, managedByItmano, onClose }: {
  channelName:     string
  managedByItmano: boolean
  onClose:         () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '16px', width: '100%', maxWidth: '440px',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} style={{ color: 'var(--accent-gold)' }} />
            Página sin configurar
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{channelName}</strong> todavía no tiene una página que abrir.
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {managedByItmano
              ? <>La página de esta fuente la conecta ITMANO, pero su link aún no está registrado. Abre la
                  fuente, pulsa <strong style={{ color: 'var(--text-primary)' }}>Editar</strong> y pega el
                  link en <strong style={{ color: 'var(--text-primary)' }}>Link de la página</strong>.</>
              : <>Abre la fuente, entra a la sección <strong style={{ color: 'var(--text-primary)' }}>Página</strong> y
                  configúrala. Cuando la publiques, este botón la abrirá directamente.</>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={BTN_PRIMARY}>Entendido</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tabla de fuentes ─────────────────────────────────────────────────────────
//
// Antes cada fuente era una tarjeta. Con más de un puñado de fuentes la
// cuadrícula obligaba a recorrer la pantalla entera para comparar dos números
// que deberían estar en la misma columna, y una fuente ocupaba lo que ahora
// ocupan seis. La fila es la misma información con la lectura de /emails.
//
// Una sola definición de columnas para la cabecera y las filas: si divergen, la
// tabla se desalinea sin que nada falle.
const GRID_COLUMNS   = '2fr 92px 176px 72px 88px 72px 92px 132px'
const GRID_MIN_WIDTH = '1080px'

const HEADERS = ['Fuente', 'Estado', 'Salud', 'Envíos', 'Leads nuevos', 'Vistas', 'Conversión', 'Acciones']

function TableHeader({ labels, gridColumns }: { labels: string[]; gridColumns: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: gridColumns,
      padding: '10px 20px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '10px',
      marginBottom: '10px',
      gap: '10px',
    }}>
      {labels.map(h => (
        <span key={h} style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {h}
        </span>
      ))}
    </div>
  )
}

/** Contenedor de un bloque de filas (una carpeta, o el grupo sin carpeta). */
function RowGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '10px',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

const CELL_NUM: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }

function ChannelRow({ ch, first, health, tenant, folders, folderId }: {
  ch:       ChannelWithMetrics
  /** La primera fila del bloque no lleva separador superior. */
  first:    boolean
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

  // Atajo para no tener que entrar a la fuente y bajar al tab Página cada vez.
  function openPage(e: React.MouseEvent) {
    e.stopPropagation()
    if (!pageUrl) { setNoPage(true); return }
    window.open(pageUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="source-row"
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/sources/${ch.slug}`)}
      onKeyDown={e => { if (e.key === 'Enter') navigate(`/sources/${ch.slug}`) }}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLUMNS,
        gap: '10px',
        alignItems: 'center',
        padding: '12px 20px',
        borderTop: first ? undefined : '1px solid var(--border-subtle)',
        cursor: 'pointer',
      }}
    >
      <NavLoadingOverlay show={navPending} />
      {noPage && (
        <NoPageModal
          channelName={ch.name}
          managedByItmano={tenant?.managedByItmano === true}
          onClose={() => setNoPage(false)}
        />
      )}

      {/* Fuente: tipo, nombre, public id, agente y si tiene secuencia */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 500, color: typeColor, background: `${typeColor}18`,
            padding: '2px 7px', borderRadius: '10px', letterSpacing: '0.06em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {typeLabel}
          </span>
          <span style={{
            fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ch.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
            {ch.publicId}
          </span>
          <span style={{
            fontSize: '10px', padding: '1px 7px', borderRadius: '4px',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          }}>
            {ch.agentName ?? 'Toda la agencia'}
          </span>
          {ch.emailSequenceId && (
            <span title="Secuencia de emails activa" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--accent-teal)' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent-teal)' }} />
              Secuencia
            </span>
          )}
        </div>
      </div>

      {/* Estado */}
      <span style={{
        fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
        letterSpacing: '0.06em', textTransform: 'uppercase', width: 'fit-content',
        color: ch.active ? 'var(--accent-green)' : 'var(--text-muted)',
        background: ch.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
      }}>
        {ch.active ? 'Activo' : 'Inactivo'}
      </span>

      {/* Dos semáforos, dos problemas distintos: el del FORMULARIO (qué tan
          bien califica lo que pregunta) y el de la FUENTE (si está reportando
          lo que hace falta para medirla). Se arreglan en sitios distintos —
          uno cambiando preguntas, el otro pegando un script — así que
          juntarlos escondía uno detrás del otro. */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {health && health.status !== 'sin_envios'
          ? [STATUS_COPY[health.status], MEASUREMENT_COPY[health.measurement]].map((b, i) => (
              <span key={i} title={`${b.label} — ${b.what}

${b.why}`} style={{
                cursor: 'help',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '9px', fontWeight: 500, padding: '2px 7px', borderRadius: '10px',
                letterSpacing: '0.05em', textTransform: 'uppercase',
                color: HEALTH_TONE[b.tone].fg,
                background: HEALTH_TONE[b.tone].bg,
              }}>
                <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor' }} />
                {b.label}
              </span>
            ))
          : <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>}
      </div>

      {/* Envíos y leads son cosas distintas: quien ya era lead y vuelve a llenar
          un formulario suma envío pero no adquisición. */}
      <span style={CELL_NUM}>{ch.metrics.submissionsInWindow}</span>

      <span style={CELL_NUM}>
        {ch.metrics.leadsInWindow}
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '1px' }}>
          {ch.metrics.leadsTotal} en total
        </span>
      </span>

      {/* Sin vistas no hay denominador: un 0% afirmaría que nadie convirtió. */}
      <span style={CELL_NUM}>{ch.metrics.pageViewsInWindow || '—'}</span>
      <span style={{ ...CELL_NUM, color: ch.metrics.conversionRate ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
        {ch.metrics.conversionRate === null ? '—' : `${ch.metrics.conversionRate}%`}
      </span>

      {/* Acciones — no navegan a la fila: cada una para su propio clic */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <FolderPicker
          kind="source"
          itemId={ch.id}
          folders={folders}
          currentFolderId={folderId}
          label={ch.name}
        />
        <button
          onClick={openPage}
          className="row-icon-btn"
          title={pageUrl ? `Abrir la página · ${pageUrl}` : 'La página aún no está configurada'}
          aria-label={pageUrl ? `Abrir la página de ${ch.name}` : `${ch.name} no tiene página configurada`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: pageUrl ? 'var(--accent-gold)' : 'var(--text-muted)', cursor: 'pointer',
          }}
        >
          <ExternalLink size={13} />
        </button>
        {/* El parámetro es `channelId`: con `channel` la lista lo ignoraba y el
            enlace abría /leads sin filtrar, sin ninguna señal de que fallara. */}
        <Link
          href={`/leads?channelId=${ch.id}`}
          className="row-icon-btn"
          title="Ver leads de esta fuente"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', textDecoration: 'none',
          }}
        >
          <Users size={13} />
        </Link>
        <button
          onClick={() => navigate(`/sources/${ch.slug}`)}
          className="row-icon-btn"
          title="Abrir detalle"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          <Eye size={13} />
        </button>
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

const ARCHIVED_GRID    = '2fr 110px 160px 120px 132px'
const ARCHIVED_HEADERS = ['Fuente', 'Estado', 'Archivado', 'Leads', 'Acciones']

function ArchivedChannelRow({ ch, first, isSuperAdmin, tenantName, canDelete }: {
  ch:           ChannelWithMetrics
  first:        boolean
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
    ? new Date(ch.archivedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  return (
    <div
      className="source-row"
      style={{
        display: 'grid',
        gridTemplateColumns: ARCHIVED_GRID,
        gap: '10px',
        alignItems: 'center',
        padding: '12px 20px',
        borderTop: first ? undefined : '1px solid var(--border-subtle)',
        opacity: 0.92,
      }}
    >
      {showDelete && (
        <DeleteChannelModal
          channel={ch}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); router.refresh() }}
        />
      )}

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontSize: '9px', fontWeight: 500, color: typeColor, background: `${typeColor}18`,
            padding: '2px 7px', borderRadius: '10px', letterSpacing: '0.06em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {typeLabel}
          </span>
          <span style={{
            fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {ch.name}
          </span>
          {isSuperAdmin && tenantName && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '4px', background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>
              {tenantName}
            </span>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', letterSpacing: '0.02em', marginTop: '3px' }}>
          {ch.publicId}
        </div>
      </div>

      <span style={{
        fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-elevated)',
        padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase',
        width: 'fit-content',
      }}>
        Archivado
      </span>

      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{archivedStr}</span>

      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
        {ch.metrics.leadsTotal}
        <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '1px' }}>
          atribuido{ch.metrics.leadsTotal === 1 ? '' : 's'}
        </span>
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {canDelete && (
          <button
            onClick={() => setShowDelete(true)}
            className="row-icon-btn"
            title="Eliminar definitivamente"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '6px',
              background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)',
              color: 'var(--accent-coral)', cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
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
  agents:           AgentOption[]
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

export function SourcesClient({ health, channels, archivedChannels, windowDays, isSuperAdmin, tenants, agents, myAgentId, tenantPages, folders }: Props) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [activeTab,    setActiveTab]    = useState<TabValue>('all')
  const [openModal,    setOpenModal]    = useState<'lead_magnet' | 'event' | 'contact_form' | null>(null)

  function setWindow(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', String(days))
    router.push(`/sources?${params.toString()}`)
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

  function renderRow(ch: ChannelWithMetrics, i: number) {
    return (
      <ChannelRow
        key={ch.id}
        ch={ch}
        first={i === 0}
        health={health[ch.id]}
        tenant={tenantPages[ch.tenantId]}
        folders={folders}
        folderId={folderOf.get(ch.id) ?? null}
      />
    )
  }

  return (
    <div>
      <style>{`
        .detail-link:hover { border-color: var(--accent-gold) !important; color: var(--accent-gold) !important; }
        .row-icon-btn:hover { border-color: var(--accent-gold) !important; color: var(--accent-gold) !important; }
        .source-row { background: var(--bg-surface); transition: background 0.1s; }
        .source-row:hover { background: var(--bg-elevated); }
      `}</style>
      {openModal === 'lead_magnet'  && <LeadMagnetModal  onClose={() => { setOpenModal(null); router.refresh() }} isSuperAdmin={isSuperAdmin} tenants={tenants} agents={agents} myAgentId={myAgentId} />}
      {openModal === 'event'        && <EventModal       onClose={() => { setOpenModal(null); router.refresh() }} isSuperAdmin={isSuperAdmin} tenants={tenants} agents={agents} myAgentId={myAgentId} />}
      {openModal === 'contact_form' && <ContactFormModal onClose={() => { setOpenModal(null); router.refresh() }} isSuperAdmin={isSuperAdmin} tenants={tenants} agents={agents} myAgentId={myAgentId} />}

      {/* Create buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <NewFolderButton kind="source" />
        <button
          onClick={() => setOpenModal('contact_form')}
          style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
        >
          <Plus size={13} />
          Crear Formulario
        </button>
        <button
          onClick={() => setOpenModal('event')}
          style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
        >
          <Plus size={13} />
          Agregar Evento
        </button>
        <button
          onClick={() => setOpenModal('lead_magnet')}
          style={{
            padding: '8px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--bg-base)', background: 'var(--accent-gold)',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={13} />
          Agregar Lead Magnet
        </button>
      </div>

      {/* Window selector + tab row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-subtle)', flex: 1 }}>
          {TAB_FILTERS.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value)}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: activeTab === t.value ? 500 : 400,
                color: activeTab === t.value ? 'var(--accent-gold)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.value ? '2px solid var(--accent-gold)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Window pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-subtle)' }}>
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: windowDays === w.value ? 500 : 400,
                color: windowDays === w.value ? 'var(--text-primary)' : 'var(--text-muted)',
                background: windowDays === w.value ? 'var(--bg-surface)' : 'transparent',
                border: windowDays === w.value ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filas. La tabla no se aplasta en pantallas estrechas: se desplaza. */}
      {display.length === 0 && (isArchivedTab || !foldersView || folders.length === 0) ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          {isArchivedTab ? 'No hay fuentes archivadas.' : 'No hay fuentes en esta categoría.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: isArchivedTab ? '880px' : GRID_MIN_WIDTH }}>
            <TableHeader
              labels={isArchivedTab ? ARCHIVED_HEADERS : HEADERS}
              gridColumns={isArchivedTab ? ARCHIVED_GRID : GRID_COLUMNS}
            />

            {isArchivedTab ? (
              <RowGroup>
                {display.map((ch, i) => (
                  <ArchivedChannelRow
                    key={ch.id}
                    ch={ch}
                    first={i === 0}
                    isSuperAdmin={isSuperAdmin}
                    tenantName={tenantName(ch.tenantId)}
                    canDelete={myAgentId === null}
                  />
                ))}
              </RowGroup>
            ) : foldersView ? (
              <>
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
                {grouped.loose.length > 0 && <RowGroup>{grouped.loose.map(renderRow)}</RowGroup>}
                {grouped.loose.length === 0 && folders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    No hay fuentes en esta categoría.
                  </div>
                )}
              </>
            ) : (
              <RowGroup>{display.map(renderRow)}</RowGroup>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
