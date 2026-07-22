'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  Search, List, LayoutGrid, ChevronDown, X, Users, SlidersHorizontal,
  Camera, ThumbsUp, MessageCircle, PenLine, FileDown, Calendar, Globe,
  Trash2, Download, CheckSquare, Square, Clock,
} from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { NavLoadingOverlay, useCardNavigation } from '@/components/ui/nav-loading'
import { STATUS_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadStatus } from '@/lib/types'
import type { ChannelOption } from './new/page'
import { getLeadSource, LEAD_SOURCE_FILTER_OPTIONS } from '@/lib/leads/source'
import { deleteLeads } from './[id]/actions'

// Source kind → icon (reuses the leads/new source icons; brand icons unavailable in
// lucide v1 so representative generics are used).
const SOURCE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  manual:       PenLine,
  instagram:    Camera,
  facebook:     ThumbsUp,
  whatsapp:     MessageCircle,
  lead_magnet:  FileDown,
  event:        Calendar,
  contact_form: Globe,
  manychat:     MessageCircle,
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })
}

function tempColor(score: number): string {
  if (score >= 70) return '#E04040'
  if (score >= 40) return '#E07B3A'
  return '#C9A96E'
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

function getKanbanLeads(key: string, leads: Lead[]): Lead[] {
  if (key === 'finished') {
    return leads.filter(
      l => l.status === 'closed' || l.status === 'process_completed' || l.status === 'lost'
    )
  }
  return leads.filter(l => l.status === key)
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TempBar({ score, segments = 8 }: { score: number; segments?: number }) {
  const color = tempColor(score)
  const filled = Math.round((score / 100) * segments)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '2px' }}>
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            style={{
              width: '5px', height: '5px', borderRadius: '1px',
              background: i < filled ? color : 'var(--bg-overlay)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '12px', color, fontWeight: 500, minWidth: '22px' }}>{score}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span style={{
      fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
      background: cfg.bgColor, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  )
}

function LeadAvatar({ lead, agents, size = 32 }: { lead: Lead; agents: Agent[]; size?: number }) {
  const agent = agents.find(a => a.id === lead.agentId)
  const initials = getInitials(lead.firstName, lead.lastName)
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%',
      background: agent ? `${agent.accentColor}26` : 'rgba(255,255,255,0.08)',
      color: agent?.accentColor ?? 'var(--text-muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${Math.floor(size * 0.37)}px`, fontWeight: 600, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function AgentAvatar({ agentId, agents, size = 'md' }: { agentId: string; agents: Agent[]; size?: 'sm' | 'md' }) {
  const agent = agents.find(a => a.id === agentId)
  const px = size === 'sm' ? 24 : 32
  if (!agent) return null
  return (
    <div style={{
      width: `${px}px`, height: `${px}px`, borderRadius: '50%',
      background: `${agent.accentColor}26`, color: agent.accentColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size === 'sm' ? '9px' : '11px', fontWeight: 600, flexShrink: 0,
    }}>
      {agent.avatarInitials}
    </div>
  )
}

function FilterSelect({
  value, onChange, options, fullWidth = false,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  // true dentro del panel de filtros: el select ocupa todo el ancho disponible.
  fullWidth?: boolean
}) {
  return (
    <div style={{ position: 'relative', display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', width: fullWidth ? '100%' : undefined }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          padding: '7px 32px 7px 12px',
          color: 'var(--text-primary)',
          fontSize: '13px',
          outline: 'none',
          appearance: 'none',
          cursor: 'pointer',
          minWidth: '160px',
          width: fullWidth ? '100%' : undefined,
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} style={{ background: '#16181C' }}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        style={{ position: 'absolute', right: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
      />
    </div>
  )
}

// Source kinds that have acquisition channels behind them → show channel sub-filter.
const CHANNEL_SOURCE_TYPES = ['lead_magnet', 'event', 'contact_form']

const FILTER_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  marginBottom: '6px',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20

const KANBAN_COLUMNS = [
  { key: 'new',             label: 'Nuevo',       color: STATUS_CONFIG.new.color },
  { key: 'nurturing',       label: 'Nurturing',   color: STATUS_CONFIG.nurturing.color },
  { key: 'warm',            label: 'Tibio',        color: STATUS_CONFIG.warm.color },
  { key: 'hot',             label: 'Caliente',    color: STATUS_CONFIG.hot.color },
  { key: 'process_started', label: 'En Proceso',  color: STATUS_CONFIG.process_started.color },
  { key: 'finished',        label: 'Finalizados', color: '#6BA368' },
]

// ─── Main Component ────────────────────────────────────────────────────────────

interface LeadsClientProps {
  leads:    Lead[]
  agents:   Agent[]
  channels: ChannelOption[]
  // Hide the per-agent filter for role 'agent' (they only ever see their own leads).
  viewerRole:     'super_admin' | 'agent_owner' | 'agent'
  viewerAgentId:  string | null
  // Initial filter state from URL query params (set by /sources deep-link or manual share).
  initialSource:    string
  initialChannelId: string
}

// Prioridad de atención (menor = más urgente). Usa el `when` del briefing de IA
// cuando existe; si no, una heurística determinista (actividad fresca en banda
// activa con score real) para que la vista sirva aunque el tenant no tenga IA.
// NO reemplaza la temperatura: ordena por PREMURA de la próxima acción.
const FROZEN_LEAD_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']
function attentionRank(lead: Lead): number {
  switch (lead.attentionWhen) {
    case 'hoy':         return 0
    case 'esta_semana': return 2
    case 'sin_apuro':   return 4
  }
  const fresh  = !!lead.lastEventAt && Date.now() - new Date(lead.lastEventAt).getTime() < 3 * 24 * 3600 * 1000
  const active = !FROZEN_LEAD_STATUSES.includes(lead.status)
  if (fresh && active && (lead.currentScore ?? 0) >= 35) return 1
  return 3
}

// Chip "Hoy": la IA marcó que la próxima acción de este lead es de hoy.
function TodayChip() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      padding: '1px 6px', borderRadius: '8px',
      color: '#E07B3A', background: 'rgba(224,123,58,0.14)',
    }}>
      <Clock size={9} /> Hoy
    </span>
  )
}

export function LeadsClient({
  leads, agents, channels, viewerRole, viewerAgentId, initialSource, initialChannelId,
}: LeadsClientProps) {
  const router = useRouter()
  const { navigate, pending: navPending } = useCardNavigation()
  const [sortMode, setSortMode] = useState<'recientes' | 'atencion'>('recientes')

  const [view, setView]               = useState<'table' | 'kanban'>('table')
  const [search, setSearch]           = useState('')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterSource, setFilterSource]     = useState(initialSource)
  const [filterChannelId, setFilterChannelId] = useState(initialChannelId)
  const [filterLanguage, setFilterLanguage] = useState('all')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)

  // Selección múltiple (solo vista tabla): eliminar en lote (doble verificación)
  // y exportar CSV.
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkPending, startBulk]  = useTransition()

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function clearSelection() { setSelected(new Set()) }

  // Dropdowns activos (los 5) — alimenta el contador del botón "Filtros".
  const activeFilterCount = [filterAgent, filterStatus, filterSource, filterChannelId, filterLanguage]
    .filter(v => v !== 'all').length

  // Sync source + channelId to the URL so the filtered view is bookmarkable/shareable.
  // Uses replaceState to avoid Next.js server re-renders on every filter keystroke.
  useEffect(() => {
    const p = new URLSearchParams()
    if (filterSource    !== 'all') p.set('source',    filterSource)
    if (filterChannelId !== 'all') p.set('channelId', filterChannelId)
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `/leads?${qs}` : '/leads')
  }, [filterSource, filterChannelId])

  // When source changes, always reset the channel sub-filter.
  function handleSourceChange(v: string) {
    setFilterSource(v)
    setFilterChannelId('all')
  }

  // Channels eligible for the sub-filter: same type as selected source, scoped by agent role.
  const channelOptions = useMemo(() => {
    if (!CHANNEL_SOURCE_TYPES.includes(filterSource)) return []
    let opts = channels.filter(c => c.channelType === filterSource)
    if (viewerAgentId) opts = opts.filter(c => c.agentId === viewerAgentId)
    return opts
  }, [channels, filterSource, viewerAgentId])

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase()
      const matchSearch =
        search === '' ||
        fullName.includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase())

      const matchAgent   = filterAgent === 'all' || lead.agentId === filterAgent
      const matchStatus  = filterStatus === 'all' || lead.status === filterStatus
      const channel      = channels.find(c => c.id === lead.acquisitionChannelId)
      // Composite source: channel type if a channel exists, else traffic_source.
      const leadSource   = getLeadSource(channel?.channelType ?? null, lead.trafficSource ?? null)
      const matchSource  = filterSource === 'all' || leadSource.kind === filterSource
      const matchChannel = filterChannelId === 'all' || lead.acquisitionChannelId === filterChannelId
      const matchLanguage = filterLanguage === 'all' || lead.language === filterLanguage

      return matchSearch && matchAgent && matchStatus && matchSource && matchChannel && matchLanguage
    })
  }, [leads, channels, search, filterAgent, filterStatus, filterSource, filterChannelId, filterLanguage])

  // Orden final: "recientes" respeta el orden del servidor (created_at desc);
  // "atencion" ordena por premura de la próxima acción y desempata por score.
  const sortedLeads = useMemo(() => {
    if (sortMode !== 'atencion') return filteredLeads
    return [...filteredLeads].sort((a, b) => {
      const ra = attentionRank(a), rb = attentionRank(b)
      if (ra !== rb) return ra - rb
      return (b.currentScore ?? 0) - (a.currentScore ?? 0)
    })
  }, [filteredLeads, sortMode])
  const attentionTodayCount = useMemo(() => leads.filter(l => l.attentionWhen === 'hoy').length, [leads])

  useEffect(() => {
    // reason: reset pagination + selección on filter change — updating derived state in effect is intentional
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
    setSelected(new Set())
  }, [search, filterAgent, filterStatus, filterSource, filterChannelId, filterLanguage, sortMode])

  const hotCount    = filteredLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length
  const totalPages  = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE)
  const pagedLeads  = sortedLeads.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
  const hasActiveFilters =
    search !== '' ||
    filterAgent !== 'all' ||
    filterStatus !== 'all' ||
    filterSource !== 'all' ||
    filterChannelId !== 'all' ||
    filterLanguage !== 'all'

  function clearFilters() {
    setSearch('')
    setFilterAgent('all')
    setFilterStatus('all')
    setFilterSource('all')
    setFilterChannelId('all')
    setFilterLanguage('all')
  }

  // ── Selección múltiple ────────────────────────────────────────────────────
  const pagedIds = pagedLeads.map(l => l.id)
  const allPagedSelected = pagedIds.length > 0 && pagedIds.every(id => selected.has(id))
  function toggleAllPaged() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPagedSelected) pagedIds.forEach(id => next.delete(id))
      else pagedIds.forEach(id => next.add(id))
      return next
    })
  }

  const selectedLeads = leads.filter(l => selected.has(l.id))

  function exportCsv() {
    if (selectedLeads.length === 0) return
    const cols = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Estado', 'Agente', 'Fuente', 'Temperatura', 'Idioma', 'Fecha']
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')]
    for (const l of selectedLeads) {
      const agent   = agents.find(a => a.id === l.agentId)
      const channel = channels.find(c => c.id === l.acquisitionChannelId)
      const src     = getLeadSource(channel?.channelType ?? null, l.trafficSource ?? null)
      lines.push([
        esc(l.firstName), esc(l.lastName), esc(l.email), esc(l.phone ?? ''),
        esc(STATUS_CONFIG[l.status]?.label ?? l.status), esc(agent?.name ?? ''),
        esc(channel?.name ?? src.label), esc(String(l.temperatureScore ?? '')),
        esc(l.language.toUpperCase()), esc(new Date(l.createdAt).toISOString().slice(0, 10)),
      ].join(','))
    }
    // BOM para que Excel respete los acentos.
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleBulkDelete() {
    setBulkError(null)
    const ids = [...selected]
    startBulk(async () => {
      const res = await deleteLeads(ids)
      if (!res.ok) { setBulkError(res.error); return }
      setDeleteStep(0)
      setDeleteInput('')
      clearSelection()
      router.refresh()
    })
  }

  const agentOptions = [
    { value: 'all', label: 'Todos los agentes' },
    ...agents.map(a => ({ value: a.id, label: a.name })),
  ]
  const statusOptions = [
    { value: 'all', label: 'Todos los estados' },
    ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
  ]
  const sourceOptions = [
    { value: 'all', label: 'Todas las fuentes' },
    ...LEAD_SOURCE_FILTER_OPTIONS,
  ]
  const languageOptions = [
    { value: 'all', label: 'Todos los idiomas' },
    { value: 'es',  label: '🇪🇸 Español' },
    { value: 'en',  label: '🇺🇸 English' },
    { value: 'pt',  label: '🇧🇷 Português' },
  ]

  // Active chips
  const activeChips: { label: string; onRemove: () => void }[] = []
  if (filterAgent !== 'all') {
    const a = agents.find(ag => ag.id === filterAgent)
    if (a) activeChips.push({ label: a.name, onRemove: () => setFilterAgent('all') })
  }
  if (filterStatus !== 'all') {
    const cfg = STATUS_CONFIG[filterStatus as LeadStatus]
    if (cfg) activeChips.push({ label: cfg.label, onRemove: () => setFilterStatus('all') })
  }
  if (filterSource !== 'all') {
    const opt = sourceOptions.find(o => o.value === filterSource)
    if (opt) activeChips.push({ label: opt.label, onRemove: () => { setFilterSource('all'); setFilterChannelId('all') } })
  }
  if (filterChannelId !== 'all') {
    const ch = channels.find(c => c.id === filterChannelId)
    if (ch) activeChips.push({ label: ch.name, onRemove: () => setFilterChannelId('all') })
  }
  if (filterLanguage !== 'all') {
    const opt = languageOptions.find(o => o.value === filterLanguage)
    if (opt) activeChips.push({ label: opt.label, onRemove: () => setFilterLanguage('all') })
  }
  if (search !== '') {
    activeChips.push({ label: `"${search}"`, onRemove: () => setSearch('') })
  }

  return (
    <div style={{ padding: '24px' }}>
      <NavLoadingOverlay show={navPending} />
      <style>{`
        .kanban-card { transition: border-color var(--dur-fast), box-shadow var(--dur-fast); }
        .kanban-card:hover { border-color: var(--border-hover) !important; box-shadow: var(--highlight-top), var(--shadow-sm); }
        .filter-input:focus { border-color: var(--border-accent) !important; outline: none; }
        .clear-btn:hover { color: var(--text-secondary) !important; }
        .page-btn:not(:disabled):hover { border-color: var(--border-accent) !important; color: var(--text-primary) !important; }
      `}</style>

      {/* ── ZONA 1: Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Leads</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {filteredLeads.length} leads · {hotCount} calientes{attentionTodayCount > 0 ? ` · ${attentionTodayCount} para hoy` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Sort: recientes / atención */}
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
          {([['recientes', 'Recientes'], ['atencion', 'Atención']] as const).map(([v, label], i) => (
            <button
              key={v}
              onClick={() => setSortMode(v)}
              title={v === 'atencion' ? 'Ordena por premura de la próxima acción (no por temperatura)' : 'Orden por fecha de registro'}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                height: '32px', padding: '0 14px', justifyContent: 'center',
                fontSize: '13px', cursor: 'pointer', border: 'none',
                borderRight: i === 0 ? '1px solid var(--border-subtle)' : 'none',
                background: sortMode === v ? 'var(--bg-elevated)' : 'transparent',
                color: sortMode === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {v === 'atencion' && <Clock size={14} />}{label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
          {(['table', 'kanban'] as const).map((v, i) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                width: '80px', height: '32px', justifyContent: 'center',
                fontSize: '13px', cursor: 'pointer', border: 'none',
                borderRight: i === 0 ? '1px solid var(--border-subtle)' : 'none',
                background: view === v ? 'var(--bg-elevated)' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {v === 'table' ? <List size={16} /> : <LayoutGrid size={16} />}
              {v === 'table' ? 'Tabla' : 'Kanban'}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── ZONA 2: Filter bar ── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="filter-input"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '7px 12px 7px 34px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              width: '240px',
            }}
          />
        </div>

        {/* Filtros primarios — solo desktop; en móvil viven en el panel */}
        {viewerRole !== 'agent' && (
          <div className="max-md:hidden">
            <FilterSelect value={filterAgent} onChange={setFilterAgent} options={agentOptions} />
          </div>
        )}
        <div className="max-md:hidden">
          <FilterSelect value={filterStatus} onChange={setFilterStatus} options={statusOptions} />
        </div>

        {/* Filtros secundarios (Fuente, Canal, Idioma) viven solo en el panel */}
        <button
          onClick={() => setShowFilters(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'var(--bg-surface)',
            border: `1px solid ${activeFilterCount > 0 ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
            borderRadius: '8px', padding: '7px 12px',
            color: activeFilterCount > 0 ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontSize: '13px', cursor: 'pointer',
            transition: 'border-color var(--dur-fast), color var(--dur-fast)',
          }}
        >
          <SlidersHorizontal size={14} />
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="clear-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '12px', padding: '4px 8px',
            }}
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {activeChips.map((chip, i) => (
            <button
              key={i}
              onClick={chip.onRemove}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'rgba(201,169,110,0.10)', border: '1px solid var(--border-accent)',
                color: 'var(--accent-gold)', fontSize: '11px',
                padding: '2px 8px', borderRadius: '20px', cursor: 'pointer',
              }}
            >
              <X size={10} /> {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Panel de filtros ── Fuente/Canal/Idioma viven aquí; Estado y Agente se
          duplican solo en móvil (mismo estado — cero desincronización). Los filtros
          aplican en vivo; "Aplicar" solo cierra. */}
      <ModalShell open={showFilters} onClose={() => setShowFilters(false)} maxWidth={400}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Filtros</span>
            <button
              onClick={() => setShowFilters(false)}
              aria-label="Cerrar filtros"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '22px' }}>
            {viewerRole !== 'agent' && (
              <div className="md:hidden">
                <label style={FILTER_LABEL}>Agente</label>
                <FilterSelect value={filterAgent} onChange={setFilterAgent} options={agentOptions} fullWidth />
              </div>
            )}
            <div className="md:hidden">
              <label style={FILTER_LABEL}>Estado</label>
              <FilterSelect value={filterStatus} onChange={setFilterStatus} options={statusOptions} fullWidth />
            </div>
            <div>
              <label style={FILTER_LABEL}>Fuente</label>
              <FilterSelect value={filterSource} onChange={handleSourceChange} options={sourceOptions} fullWidth />
            </div>
            {channelOptions.length > 0 && (
              <div>
                <label style={FILTER_LABEL}>Canal</label>
                <FilterSelect
                  value={filterChannelId}
                  onChange={setFilterChannelId}
                  options={[
                    { value: 'all', label: 'Todos los canales' },
                    ...channelOptions.map(c => ({ value: c.id, label: c.name })),
                  ]}
                  fullWidth
                />
              </div>
            )}
            <div>
              <label style={FILTER_LABEL}>Idioma</label>
              <FilterSelect value={filterLanguage} onChange={setFilterLanguage} options={languageOptions} fullWidth />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <button
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              style={{
                padding: '8px 14px', fontSize: '13px', borderRadius: '8px',
                background: 'transparent', border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
                opacity: hasActiveFilters ? 1 : 0.5,
              }}
            >
              Limpiar todo
            </button>
            <button
              onClick={() => setShowFilters(false)}
              className="btn-cta"
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer',
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Barra de selección múltiple (solo tabla) ── */}
      {view === 'table' && selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)',
          borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {selected.size} {selected.size === 1 ? 'lead seleccionado' : 'leads seleccionados'}
          </span>
          <button
            onClick={clearSelection}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px', textDecoration: 'underline' }}
          >
            Deseleccionar
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={exportCsv}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', fontSize: '13px', borderRadius: '8px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <Download size={14} /> Descargar CSV
          </button>
          <button
            onClick={() => { setDeleteStep(1); setDeleteInput(''); setBulkError(null) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: 'rgba(201,123,107,0.12)', border: '1px solid rgba(201,123,107,0.3)',
              color: 'var(--accent-coral)', cursor: 'pointer',
            }}
          >
            <Trash2 size={14} /> Eliminar ({selected.size})
          </button>
        </div>
      )}

      {/* ── ZONA 3A: Table view ── (dense table; redesign deferred to Prompt C.
          Defensive horizontal scroll on phones so columns stay readable.)
          AnimatePresence mode="wait": crossfade de 150ms al alternar tabla↔kanban. */}
      <AnimatePresence mode="wait" initial={false}>
      {view === 'table' ? (
        <m.div
          key="table"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}
        >
          <div className="max-md:overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '10px 0 10px 16px', width: '36px' }}>
                  <button
                    onClick={toggleAllPaged}
                    aria-label={allPagedSelected ? 'Deseleccionar página' : 'Seleccionar página'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: allPagedSelected ? 'var(--accent-gold)' : 'var(--text-muted)', display: 'flex', padding: 0 }}
                  >
                    {allPagedSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                {['Lead', 'Agente', 'Estado', 'Fuente', 'Temperatura', 'Idioma', 'Fecha'].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontSize: '11px', fontWeight: 500,
                      letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedLeads.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', padding: '60px 20px', gap: '12px',
                    }}>
                      <Users size={40} style={{ color: 'var(--text-muted)' }} />
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '14px', marginBottom: '4px' }}>No se encontraron leads</div>
                        <div style={{ fontSize: '12px' }}>Ajusta los filtros para ver resultados</div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedLeads.map((lead, idx) => {
                  const agent      = agents.find(a => a.id === lead.agentId)
                  const channel    = channels.find(c => c.id === lead.acquisitionChannelId)
                  const leadSource = getLeadSource(channel?.channelType ?? null, lead.trafficSource ?? null)
                  const SrcIcon    = SOURCE_ICON[leadSource.kind]
                  const langCfg    = LANGUAGE_CONFIG[lead.language]
                  const isLast     = idx === pagedLeads.length - 1

                  const isSelected = selected.has(lead.id)
                  return (
                    <tr
                      key={lead.id}
                      className="row-hover"
                      style={{
                        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(201,169,110,0.06)' : undefined,
                      }}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      {/* Checkbox de selección */}
                      <td style={{ padding: '12px 0 12px 16px', width: '36px' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelect(lead.id)}
                          aria-label={isSelected ? 'Deseleccionar lead' : 'Seleccionar lead'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSelected ? 'var(--accent-gold)' : 'var(--text-muted)', display: 'flex', padding: 0 }}
                        >
                          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      {/* Lead */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <LeadAvatar lead={lead} agents={agents} size={32} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {lead.firstName} {lead.lastName}
                              </span>
                              {lead.attentionWhen === 'hoy' && <TodayChip />}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{lead.email}</div>
                          </div>
                        </div>
                      </td>
                      {/* Agente */}
                      <td style={{ padding: '12px 16px', width: '140px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AgentAvatar agentId={lead.agentId} agents={agents} size="sm" />
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {agent?.name.split(' ')[0] ?? '—'}
                          </span>
                        </div>
                      </td>
                      {/* Estado */}
                      <td style={{ padding: '12px 16px', width: '140px' }}>
                        <StatusBadge status={lead.status} />
                      </td>
                      {/* Fuente (composite: channel type / traffic source) */}
                      <td style={{ padding: '12px 16px', width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                          {SrcIcon && <SrcIcon size={13} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {leadSource.label}
                            </div>
                            {channel && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {channel.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Temperatura */}
                      <td style={{ padding: '12px 16px', width: '120px' }}>
                        <TempBar score={lead.temperatureScore ?? 0} segments={8} />
                      </td>
                      {/* Idioma */}
                      <td style={{ padding: '12px 16px', width: '80px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {langCfg.flag} {lead.language.toUpperCase()}
                        </span>
                      </td>
                      {/* Fecha */}
                      <td style={{ padding: '12px 16px', width: '100px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {formatDate(lead.createdAt)}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          {filteredLeads.length > ITEMS_PER_PAGE && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
              padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="page-btn"
                style={{
                  padding: '4px 12px', fontSize: '12px', borderRadius: '6px',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="page-btn"
                style={{
                  padding: '4px 12px', fontSize: '12px', borderRadius: '6px',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </m.div>
      ) : (

      /* ── ZONA 3B: Kanban view ── */
        <m.div
          key="kanban"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', minHeight: 'calc(100vh - 280px)' }}
        >
          {KANBAN_COLUMNS.map(col => {
            const colLeads = getKanbanLeads(col.key, filteredLeads)

            return (
              <div
                key={col.key}
                style={{
                  width: '240px', flexShrink: 0,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderTop: `3px solid ${col.color}`,
                  borderRadius: '12px',
                  padding: '12px',
                  height: 'fit-content',
                  maxHeight: 'calc(100vh - 300px)',
                  overflowY: 'auto',
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>{col.label}</span>
                  </div>
                  <span style={{
                    fontSize: '11px', background: 'var(--bg-overlay)',
                    color: 'var(--text-muted)', padding: '2px 7px', borderRadius: '10px',
                  }}>
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards */}
                {colLeads.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', padding: '20px 0' }}>
                    Sin leads
                  </div>
                ) : (
                  colLeads.map(lead => {
                    const agent   = agents.find(a => a.id === lead.agentId)
                    const channel = channels.find(c => c.id === lead.acquisitionChannelId)
                    const langCfg = LANGUAGE_CONFIG[lead.language]

                    return (
                      <m.div
                        key={lead.id}
                        className="kanban-card"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ duration: 0.15 }}
                        style={{
                          background:   'var(--bg-elevated)',
                          border:       '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding:      '10px 12px',
                          marginBottom: '8px',
                          cursor:       'pointer',
                        }}
                        onClick={() => navigate(`/leads/${lead.id}`)}
                      >
                        {/* Row 1: avatar + name + date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <LeadAvatar lead={lead} agents={agents} size={24} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.firstName} {lead.lastName}
                            </div>
                          </div>
                          {lead.attentionWhen === 'hoy' && <TodayChip />}
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                            {formatDate(lead.createdAt)}
                          </span>
                        </div>
                        {/* Row 2: agent name */}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                          {agent?.name.split(' ')[0] ?? '—'}
                        </div>
                        {/* Row 3: temp bar */}
                        <div style={{ marginBottom: '6px' }}>
                          <TempBar score={lead.temperatureScore ?? 0} segments={6} />
                        </div>
                        {/* Row 4: language + channel type */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{langCfg.flag}</span>
                          {channel && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {CHANNEL_TYPE_LABELS[channel.channelType] ?? channel.channelType}
                            </span>
                          )}
                        </div>
                        {/* Status badge only in 'finished' column */}
                        {col.key === 'finished' && (
                          <div style={{ marginTop: '6px' }}>
                            <StatusBadge status={lead.status} />
                          </div>
                        )}
                      </m.div>
                    )
                  })
                )}
              </div>
            )
          })}
        </m.div>
      )}
      </AnimatePresence>

      {/* ── Eliminar en lote — Paso 1: primera confirmación ── */}
      <ModalShell open={deleteStep === 1} onClose={() => setDeleteStep(0)} maxWidth={460}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar {selected.size} {selected.size === 1 ? 'lead' : 'leads'}</span>
            <button onClick={() => setDeleteStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
            Vas a eliminar <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong> {selected.size === 1 ? 'lead' : 'leads'}.
            Se eliminan también sus eventos, runs de secuencia y notificaciones.{' '}
            <strong style={{ color: 'var(--accent-coral)' }}>No se puede deshacer.</strong>
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setDeleteStep(0)} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={() => { setDeleteStep(2); setDeleteInput('') }} style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
              border: '1px solid rgba(201,123,107,0.3)', cursor: 'pointer',
            }}>Continuar →</button>
          </div>
        </div>
      </ModalShell>

      {/* ── Eliminar en lote — Paso 2: confirmación por texto ── */}
      <ModalShell open={deleteStep === 2} onClose={() => setDeleteStep(0)} maxWidth={420}>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--accent-coral)' }}>Confirmar eliminación</span>
            <button onClick={() => setDeleteStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Para confirmar la eliminación de <strong style={{ color: 'var(--text-primary)' }}>{selected.size}</strong> {selected.size === 1 ? 'lead' : 'leads'}, escribe <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>ELIMINAR</strong>:
          </p>
          <input
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            placeholder="ELIMINAR"
            autoFocus
            style={{
              width: '100%', background: 'var(--bg-overlay)',
              border: '1px solid rgba(201,123,107,0.3)', borderRadius: '8px',
              padding: '9px 12px', color: 'var(--text-primary)', fontSize: '14px',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace', marginBottom: '16px',
            }}
          />
          {bulkError && (
            <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginBottom: '12px' }}>{bulkError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setDeleteStep(0)} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
            <button
              onClick={handleBulkDelete}
              disabled={deleteInput !== 'ELIMINAR' || bulkPending}
              style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: deleteInput === 'ELIMINAR' ? 'rgba(201,123,107,0.2)' : 'var(--bg-elevated)',
                color: deleteInput === 'ELIMINAR' ? 'var(--accent-coral)' : 'var(--text-muted)',
                border: deleteInput === 'ELIMINAR' ? '1px solid rgba(201,123,107,0.4)' : '1px solid var(--border-subtle)',
                cursor: (deleteInput !== 'ELIMINAR' || bulkPending) ? 'not-allowed' : 'pointer',
                opacity: bulkPending ? 0.7 : 1,
              }}
            >
              {bulkPending ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  )
}
