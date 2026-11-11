'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, m } from 'motion/react'
import {
  Search, List, LayoutGrid, ChevronDown, X, Users, SlidersHorizontal,
  Camera, ThumbsUp, MessageCircle, PenLine, FileDown, FileUp, Calendar, Globe,
  Trash2, Download, CheckSquare, Square, Clock, Mail,
} from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { NavLoadingOverlay, useCardNavigation } from '@/components/ui/nav-loading'
import { RefreshingPill } from '@/components/ui/loading-indicator'
import { DataScope } from '@/components/ui/data-table'
import { TABLE_COLS, TABLE_COLS_MD, TABLE_COLS_SM } from './leads-table-cols'
import { LANGUAGE_CONFIG } from '@/lib/config'
import {
  QUALITY_BANDS, QUALITY_CONFIG, URGENCY_CONFIG,
  STAGES, STAGE_CONFIG, STAGE_FILTER_OPTIONS,
} from '@/lib/scoring/priority'
import type { QualityBand, Urgency, Stage } from '@/lib/scoring/priority'
import type { Agent } from '@/lib/types'
import type { KanbanColumn, LeadListFilters, LeadListItem } from '@/lib/leads/list-filters'
import { leadListFiltersToQuery, hasActiveLeadFilters, KANBAN_COLUMN_LIMIT } from '@/lib/leads/list-filters'
import type { ChannelOption } from './new/page'
import type { LeadTag } from '@/lib/leads/tags'
import { getLeadSource, LEAD_SOURCE_FILTER_OPTIONS } from '@/lib/leads/source'
import { deleteLeads } from './[id]/actions'
import { createBroadcastFromLeadFilters, createBroadcastFromLeads } from '../emails/broadcast-actions'
import { FechaLocal } from '@/components/ui/local-date'

// Source kind → icon (reuses the leads/new source icons; brand icons unavailable in
// lucide v1 so representative generics are used).
const SOURCE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  manual:       PenLine,
  import:       FileUp,
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

// Estilo con variables CSS (`--tone`), que React no tipa.
const tone = (color: string) => ({ '--tone': color }) as React.CSSProperties

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return <FechaLocal fecha={dateStr} opciones={{ month: 'short', day: 'numeric' }} />
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

// Enter o espacio sobre una fila o tarjeta enfocada abre el lead, como el clic.
function onActivate(open: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// Calidad + urgencia en una celda. Reemplaza la barra de temperatura: el score
// numerico mezclaba los dos ejes y por eso un lead excelente que se quedaba
// callado "bajaba". Aqui la calidad no se mueve; lo que cambia es la urgencia.
function QualityCell({ band, urgency }: {
  band: QualityBand | null
  urgency: Urgency | null
}) {
  if (!band) return <span className="cell-muted">—</span>
  const q = QUALITY_CONFIG[band]
  return (
    <span className="quality-cell" style={{ color: q.color }}>
      {q.label}
      {urgency && urgency !== 'sin_apuro' && (
        <small style={{ color: URGENCY_CONFIG[urgency].color }}>{URGENCY_CONFIG[urgency].label}</small>
      )}
    </span>
  )
}

function StageBadge({ stage }: { stage: Stage }) {
  const cfg = STAGE_CONFIG[stage]
  return <span className="pill pill-square" style={tone(cfg.color)}>{cfg.label}</span>
}

function LeadAvatar({ lead, agent, small = false }: { lead: LeadListItem; agent: Agent | undefined; small?: boolean }) {
  return (
    <span
      className={small ? 'avatar avatar-sm' : 'avatar'}
      style={agent ? tone(agent.accentColor) : undefined}
      aria-hidden="true"
    >
      {getInitials(lead.firstName, lead.lastName)}
    </span>
  )
}

function FilterSelect({
  value, onChange, options, label, fullWidth = false,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  label: string
  // true dentro del panel de filtros: el select ocupa todo el ancho disponible.
  fullWidth?: boolean
}) {
  return (
    <span className={fullWidth ? 'select-field select-field-full' : 'select-field'}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="settings-input"
        aria-label={label}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  )
}

// Source kinds that have acquisition channels behind them → show channel sub-filter.
const CHANNEL_SOURCE_TYPES = ['lead_magnet', 'event', 'contact_form']

// ─── Constants ────────────────────────────────────────────────────────────────

// Una columna por etapa, en orden del embudo. Antes eran seis y cuatro de ellas
// (Nuevo/Nurturing/Tibio/Caliente) eran bandas de temperatura del mismo punto
// del embudo: mover una tarjeta entre ellas no significaba nada porque quien las
// movía era el trigger de scoring, no el agente.
const KANBAN_COLUMNS = STAGES.map(key => ({
  key,
  label: STAGE_CONFIG[key].label,
  color: STAGE_CONFIG[key].color,
}))

const SORT_OPTIONS = [
  ['recientes', 'Recientes', 'Orden por fecha de registro'],
  ['prioridad', 'Prioridad', 'Primero lo que caduca, y dentro de eso lo de mejor calidad'],
  ['valor',     'Valor',     'Por el monto que declaró el lead. Los que no lo declararon van al final'],
] as const

// ─── Main Component ────────────────────────────────────────────────────────────

interface LeadsClientProps {
  // Página actual ya filtrada y ordenada por el servidor (vista tabla).
  leads:    LeadListItem[]
  // Columnas ya agrupadas por el servidor (vista kanban); null en vista tabla.
  kanban:   KanbanColumn[] | null
  total:               number
  highQualityCount:    number
  urgentTodayCount:    number
  page:                number
  totalPages:          number
  filters:             LeadListFilters
  agents:   Agent[]
  channels: ChannelOption[]
  // Catálogo de etiquetas del tenant (116): da nombre y color a los `tagIds` de
  // cada fila y llena el filtro. La fila sólo trae ids.
  tags:     LeadTag[]
  // Hide the per-agent filter for role 'agent' (they only ever see their own leads).
  viewerRole:     'super_admin' | 'agent_owner' | 'agent'
  viewerAgentId:  string | null
}

// Etiquetas de una fila. Se muestran dos y el resto se cuenta: con cuatro chips
// la celda del lead deja de leerse, y el nombre sigue siendo lo primero que hay
// que ver. El tooltip lista todas.
function TagChips({ tagIds, catalog, max = 2 }: { tagIds: string[]; catalog: LeadTag[]; max?: number }) {
  if (tagIds.length === 0) return null

  // El orden del catálogo, no el de asignación: la misma etiqueta tiene que
  // aparecer en el mismo sitio en todas las filas.
  const resolved = catalog.filter(t => tagIds.includes(t.id))
  if (resolved.length === 0) return null

  const shown  = resolved.slice(0, max)
  const hidden = resolved.length - shown.length

  return (
    <span className="tag-chips" title={resolved.map(t => t.name).join(' · ')}>
      {shown.map(t => (
        <span key={t.id} className="tag-chip" style={tone(t.color)}>{t.name}</span>
      ))}
      {hidden > 0 && <span className="tag-chips-more">+{hidden}</span>}
    </span>
  )
}

// Chip "Hoy": la IA marcó que la próxima acción de este lead es de hoy.
function TodayChip() {
  return (
    <span className="pill pill-xs" data-tone="alert">
      <Clock size={9} aria-hidden="true" /> Hoy
    </span>
  )
}

export function LeadsClient({
  leads, kanban, total, highQualityCount, urgentTodayCount, page, totalPages,
  filters, agents, channels, tags, viewerRole, viewerAgentId,
}: LeadsClientProps) {
  const router = useRouter()
  const { navigate, pending: navPending } = useCardNavigation()
  // Cada cambio de filtro es una navegación: el servidor devuelve la nueva página.
  const [isPending, startFilterTransition] = useTransition()

  const [showFilters, setShowFilters] = useState(false)
  // El input se escribe en local y se empuja a la URL con debounce; así no se
  // dispara una petición por tecla.
  const [searchInput, setSearchInput] = useState(filters.q)

  // Selección múltiple (solo vista tabla): eliminar en lote (doble verificación)
  // y exportar CSV. Guarda el lead completo, no sólo el id, para que la selección
  // sobreviva al cambio de página (los leads de otras páginas ya no están en props).
  const [selected, setSelected]   = useState<Map<string, LeadListItem>>(new Map())
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [bulkPending, startBulk]  = useTransition()
  const [broadcastPending, startBroadcast] = useTransition()
  const [broadcastError, setBroadcastError] = useState<string | null>(null)

  function pushFilters(patch: Partial<LeadListFilters>) {
    // Cualquier cambio de filtro vuelve a la página 1 salvo que se pida otra.
    const next = { ...filters, ...patch, page: patch.page ?? 1 }
    const qs = leadListFiltersToQuery(next)
    startFilterTransition(() => {
      router.push(qs ? `/leads?${qs}` : '/leads', { scroll: false })
    })
  }

  // El input sigue a la URL cuando el filtro cambia por fuera (chip, "Limpiar").
  useEffect(() => {
    // reason: sincronizar estado local con la prop del servidor
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(filters.q)
  }, [filters.q])

  useEffect(() => {
    if (searchInput.trim() === filters.q) return
    const t = setTimeout(() => pushFilters({ q: searchInput.trim() }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, filters.q])

  // La selección se limpia al cambiar de filtro, no al cambiar de página.
  const filterKey = leadListFiltersToQuery({ ...filters, page: 1 })
  useEffect(() => {
    // reason: reset de selección al cambiar los filtros
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(new Map())
  }, [filterKey])

  function toggleSelect(lead: LeadListItem) {
    setSelected(prev => {
      const next = new Map(prev)
      if (next.has(lead.id)) next.delete(lead.id); else next.set(lead.id, lead)
      return next
    })
  }
  function clearSelection() { setSelected(new Map()) }

  // Correo grupal: abre un borrador con lo que hay en pantalla. Nada sale hasta
  // que alguien lo revise y lo confirme en /emails/grupales/[id].
  function openBroadcast(create: () => ReturnType<typeof createBroadcastFromLeads>) {
    setBroadcastError(null)
    startBroadcast(async () => {
      const res = await create()
      if (!res.ok) { setBroadcastError(res.error); return }
      router.push(`/emails/grupales/${res.id}`)
    })
  }

  // Dropdowns activos (los 5) — alimenta el contador del botón "Filtros".
  const activeFilterCount = [
    filters.agentId, filters.stage, filters.source, filters.channelId, filters.language,
  ].filter(v => v !== 'all').length

  // When source changes, always reset the channel sub-filter.
  function handleSourceChange(v: string) {
    pushFilters({ source: v, channelId: 'all' })
  }

  // Channels eligible for the sub-filter: same type as selected source, scoped by
  // agent role. Sólo los activos se ofrecen (los inactivos siguen resolviendo
  // nombre y fuente de leads viejos, pero no son un filtro que ofrecer).
  const channelOptions = useMemo(() => {
    if (!CHANNEL_SOURCE_TYPES.includes(filters.source)) return []
    let opts = channels.filter(c => c.active && c.channelType === filters.source)
    if (viewerAgentId) opts = opts.filter(c => c.agentId === viewerAgentId)
    return opts
  }, [channels, filters.source, viewerAgentId])

  const hasFilters = hasActiveLeadFilters(filters)

  function clearFilters() {
    // La lista tiene que quedar igual que hasActiveLeadFilters considera "sin
    // filtros": `quality` faltaba aquí, así que "Limpiar" dejaba el botón activo
    // y la lista filtrada por banda de calidad.
    pushFilters({
      q: '', agentId: 'all', stage: 'all', source: 'all', channelId: 'all',
      language: 'all', quality: 'all', tag: 'all',
    })
  }

  // ── Selección múltiple ────────────────────────────────────────────────────
  const allPagedSelected = leads.length > 0 && leads.every(l => selected.has(l.id))
  function toggleAllPaged() {
    setSelected(prev => {
      const next = new Map(prev)
      if (allPagedSelected) leads.forEach(l => next.delete(l.id))
      else leads.forEach(l => next.set(l.id, l))
      return next
    })
  }

  const selectedLeads = [...selected.values()]

  function exportCsv() {
    if (selectedLeads.length === 0) return
    const cols = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Etapa', 'Agente', 'Fuente', 'Score', 'Idioma', 'Etiquetas', 'Fecha']
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [cols.join(',')]
    for (const l of selectedLeads) {
      const agent   = agents.find(a => a.id === l.agentId)
      const channel = channels.find(c => c.id === l.acquisitionChannelId)
      const src     = getLeadSource(channel?.channelType ?? null, l.trafficSource ?? null)
      lines.push([
        esc(l.firstName), esc(l.lastName), esc(l.email), esc(l.phone ?? ''),
        esc(STAGE_CONFIG[l.stage]?.label ?? l.stage), esc(agent?.name ?? ''),
        esc(channel?.name ?? src.label), esc(String(l.score ?? '')),
        esc(l.language.toUpperCase()),
        // Las etiquetas van en UNA celda separada por " · ": el CSV lo abre una
        // persona en Excel, no un importador.
        esc(tags.filter(t => l.tagIds.includes(t.id)).map(t => t.name).join(' · ')),
        esc(new Date(l.createdAt).toISOString().slice(0, 10)),
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
    const ids = [...selected.keys()]
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
  const stageOptions = [
    { value: 'all', label: 'Todas las etapas' },
    ...STAGE_FILTER_OPTIONS,
  ]
  const sourceOptions = [
    { value: 'all', label: 'Todas las fuentes' },
    ...LEAD_SOURCE_FILTER_OPTIONS,
  ]
  // Las bandas salen del vocabulario compartido: si algún día cambian, el filtro
  // no puede quedarse atrás.
  const qualityOptions = [
    { value: 'all', label: 'Toda la calidad' },
    ...QUALITY_BANDS.map(b => ({ value: b, label: QUALITY_CONFIG[b].label })),
  ]
  // Etiquetas: el valor es el SLUG, que es lo que viaja en la URL. Si el tenant
  // no tiene catálogo, el filtro no se ofrece (ver más abajo) en vez de mostrar
  // un desplegable con una sola opción inútil.
  const tagOptions = [
    { value: 'all', label: 'Todas las etiquetas' },
    ...tags.map(t => ({ value: t.slug, label: t.name })),
  ]
  const languageOptions = [
    { value: 'all', label: 'Todos los idiomas' },
    { value: 'es',  label: '🇪🇸 Español' },
    { value: 'en',  label: '🇺🇸 English' },
    { value: 'pt',  label: '🇧🇷 Português' },
  ]

  // Active chips
  const activeChips: { label: string; onRemove: () => void }[] = []
  if (filters.agentId !== 'all') {
    const a = agents.find(ag => ag.id === filters.agentId)
    if (a) activeChips.push({ label: a.name, onRemove: () => pushFilters({ agentId: 'all' }) })
  }
  if (filters.stage !== 'all') {
    const cfg = STAGE_CONFIG[filters.stage as Stage]
    if (cfg) activeChips.push({ label: cfg.label, onRemove: () => pushFilters({ stage: 'all' }) })
  }
  if (filters.source !== 'all') {
    const opt = sourceOptions.find(o => o.value === filters.source)
    if (opt) activeChips.push({ label: opt.label, onRemove: () => pushFilters({ source: 'all', channelId: 'all' }) })
  }
  if (filters.channelId !== 'all') {
    const ch = channels.find(c => c.id === filters.channelId)
    if (ch) activeChips.push({ label: ch.name, onRemove: () => pushFilters({ channelId: 'all' }) })
  }
  if (filters.language !== 'all') {
    const opt = languageOptions.find(o => o.value === filters.language)
    if (opt) activeChips.push({ label: opt.label, onRemove: () => pushFilters({ language: 'all' }) })
  }
  if (filters.quality !== 'all') {
    const opt = qualityOptions.find(o => o.value === filters.quality)
    if (opt) activeChips.push({ label: `Calidad ${opt.label.toLowerCase()}`, onRemove: () => pushFilters({ quality: 'all' }) })
  }
  if (filters.tag !== 'all') {
    const t = tags.find(tg => tg.slug === filters.tag)
    if (t) activeChips.push({ label: t.name, onRemove: () => pushFilters({ tag: 'all' }) })
  }
  if (filters.q !== '') {
    activeChips.push({ label: `"${filters.q}"`, onRemove: () => pushFilters({ q: '' }) })
  }

  const summary = `${total} ${total === 1 ? 'lead' : 'leads'} · ${highQualityCount} de calidad alta${urgentTodayCount > 0 ? ` · ${urgentTodayCount} para hoy` : ''}`
  const showFilterBroadcast = filters.view === 'table' && selected.size === 0 && hasFilters && total > 0

  return (
    <div>
      <NavLoadingOverlay show={navPending} />

      {/* ── Búsqueda, filtros, orden y vista ── */}
      <div className="toolbar">
        <div className="toolbar-group">
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar por nombre o email..."
              aria-label="Buscar leads por nombre o email"
              className="settings-input"
            />
          </label>

          {/* Filtros primarios — solo desktop; en móvil viven en el panel */}
          {viewerRole !== 'agent' && (
            <span className="max-md:hidden">
              <FilterSelect label="Agente" value={filters.agentId} onChange={v => pushFilters({ agentId: v })} options={agentOptions} />
            </span>
          )}
          <span className="max-md:hidden">
            <FilterSelect label="Etapa" value={filters.stage} onChange={v => pushFilters({ stage: v })} options={stageOptions} />
          </span>

          {/* Filtros secundarios (Fuente, Canal, Calidad, Etiqueta, Idioma) viven solo en el panel */}
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className="btn btn-ghost"
            data-active={activeFilterCount > 0 || undefined}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>

          {hasFilters && (
            <button type="button" onClick={clearFilters} className="settings-link-btn">
              Limpiar
            </button>
          )}
        </div>

        <div className="toolbar-group">
          <div className="segmented" role="group" aria-label="Orden">
            {SORT_OPTIONS.map(([v, label, title]) => (
              <button
                key={v}
                type="button"
                onClick={() => pushFilters({ sort: v })}
                aria-pressed={filters.sort === v}
                title={title}
              >
                {v === 'prioridad' && <Clock size={13} aria-hidden="true" />}{label}
              </button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="Vista">
            {(['table', 'kanban'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => pushFilters({ view: v })}
                aria-pressed={filters.view === v}
              >
                {v === 'table' ? <List size={14} aria-hidden="true" /> : <LayoutGrid size={14} aria-hidden="true" />}
                {v === 'table' ? 'Tabla' : 'Kanban'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumen, chips de filtros activos y, sin selección, correo al filtro */}
      <div className="leads-summary">
        <div className="chip-list">
          <span className="toolbar-meta">{summary}</span>
          {activeChips.map((chip, i) => (
            <button key={i} type="button" onClick={chip.onRemove} className="chip-remove" aria-label={`Quitar filtro ${chip.label}`}>
              <X size={10} aria-hidden="true" /> {chip.label}
            </button>
          ))}
        </div>
        {/* Sin selección: los filtros activos también son una audiencia. */}
        {showFilterBroadcast && (
          <button
            type="button"
            onClick={() => openBroadcast(() => createBroadcastFromLeadFilters(leadListFiltersToQuery(filters)))}
            disabled={broadcastPending}
            aria-busy={broadcastPending}
            className="btn btn-ghost"
          >
            <Mail size={13} aria-hidden="true" /> {broadcastPending ? 'Abriendo…' : `Correo grupal a este filtro (${total})`}
          </button>
        )}
      </div>

      {/* ── Panel de filtros ── Fuente/Canal/Idioma viven aquí; Etapa y Agente se
          duplican solo en móvil (mismo estado — cero desincronización). Los filtros
          aplican en vivo; "Aplicar" solo cierra. */}
      <ModalShell open={showFilters} onClose={() => setShowFilters(false)} maxWidth={400}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <h2 className="settings-modal-title">Filtros</h2>
            <button type="button" onClick={() => setShowFilters(false)} aria-label="Cerrar filtros" className="icon-btn">
              <X size={18} />
            </button>
          </div>

          <div className="settings-stack settings-stack-tight">
            {viewerRole !== 'agent' && (
              <div className="md:hidden">
                <span className="settings-field-label">Agente</span>
                <FilterSelect label="Agente" value={filters.agentId} onChange={v => pushFilters({ agentId: v })} options={agentOptions} fullWidth />
              </div>
            )}
            <div className="md:hidden">
              <span className="settings-field-label">Etapa</span>
              <FilterSelect label="Etapa" value={filters.stage} onChange={v => pushFilters({ stage: v })} options={stageOptions} fullWidth />
            </div>
            <div>
              <span className="settings-field-label">Fuente</span>
              <FilterSelect label="Fuente" value={filters.source} onChange={handleSourceChange} options={sourceOptions} fullWidth />
            </div>
            {channelOptions.length > 0 && (
              <div>
                <span className="settings-field-label">Canal</span>
                <FilterSelect
                  label="Canal"
                  value={filters.channelId}
                  onChange={v => pushFilters({ channelId: v })}
                  options={[
                    { value: 'all', label: 'Todos los canales' },
                    ...channelOptions.map(c => ({ value: c.id, label: c.name })),
                  ]}
                  fullWidth
                />
              </div>
            )}
            <div>
              <span className="settings-field-label">Calidad</span>
              <FilterSelect label="Calidad" value={filters.quality} onChange={v => pushFilters({ quality: v })} options={qualityOptions} fullWidth />
            </div>
            {tags.length > 0 && (
              <div>
                <span className="settings-field-label">Etiqueta</span>
                <FilterSelect label="Etiqueta" value={filters.tag} onChange={v => pushFilters({ tag: v })} options={tagOptions} fullWidth />
              </div>
            )}
            <div>
              <span className="settings-field-label">Idioma</span>
              <FilterSelect label="Idioma" value={filters.language} onChange={v => pushFilters({ language: v })} options={languageOptions} fullWidth />
            </div>
          </div>

          <div className="settings-inline settings-inline-between">
            <button type="button" onClick={clearFilters} disabled={!hasFilters} className="btn btn-ghost">
              Limpiar todo
            </button>
            <button type="button" onClick={() => setShowFilters(false)} className="btn btn-primary">
              Aplicar
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Barra de selección múltiple (solo tabla) ── */}
      {filters.view === 'table' && selected.size > 0 && (
        <div className="selection-bar">
          <span>{selected.size} {selected.size === 1 ? 'lead seleccionado' : 'leads seleccionados'}</span>
          <button type="button" onClick={clearSelection} className="settings-link-btn">Deseleccionar</button>
          <span className="selection-bar-fill" />
          <button
            type="button"
            onClick={() => openBroadcast(() => createBroadcastFromLeads([...selected.keys()]))}
            disabled={broadcastPending}
            aria-busy={broadcastPending}
            className="btn btn-ghost"
          >
            <Mail size={14} aria-hidden="true" /> {broadcastPending ? 'Abriendo…' : 'Correo grupal'}
          </button>
          <button type="button" onClick={exportCsv} className="btn btn-ghost">
            <Download size={14} aria-hidden="true" /> Descargar CSV
          </button>
          <button
            type="button"
            onClick={() => { setDeleteStep(1); setDeleteInput(''); setBulkError(null) }}
            className="btn btn-danger"
          >
            <Trash2 size={14} aria-hidden="true" /> Eliminar ({selected.size})
          </button>
        </div>
      )}

      {broadcastError && <p role="alert" className="form-error">{broadcastError}</p>}

      {/* ── Resultados ── AnimatePresence mode="wait": crossfade de 150ms al
          alternar tabla↔kanban. */}
      <div className="results-zone" style={{ position: 'relative' }}>
      <RefreshingPill show={isPending} />
      <div style={{ opacity: isPending ? 0.55 : 1, transition: 'opacity var(--dur-fast)' }}>
      <AnimatePresence mode="wait" initial={false}>
      {filters.view === 'table' ? (
        <m.div
          key="table"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {leads.length === 0 ? (
            <div className="empty-card">
              <span className="empty-card-icon" aria-hidden="true"><Users size={18} /></span>
              No se encontraron leads.
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="btn btn-ghost">Limpiar filtros</button>
              )}
            </div>
          ) : (
          <DataScope cols={TABLE_COLS} colsMd={TABLE_COLS_MD} colsSm={TABLE_COLS_SM}>
            <div className="dt-grid dt-head">
              <button
                type="button"
                onClick={toggleAllPaged}
                aria-pressed={allPagedSelected}
                aria-label={allPagedSelected ? 'Deseleccionar página' : 'Seleccionar página'}
                className="check-btn"
              >
                {allPagedSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
              <span>Lead</span>
              <span className="dt-hide-md">Agente</span>
              <span className="dt-hide-sm">Etapa</span>
              <span className="dt-hide-md">Fuente</span>
              <span className="dt-hide-sm">Calidad</span>
              <span className="dt-hide-md">Idioma</span>
              <span className="dt-hide-sm">Fecha</span>
              <span className="dt-show-sm">Etapa</span>
            </div>

            <div className="dt">
              {leads.map(lead => {
                const agent      = agents.find(a => a.id === lead.agentId)
                const channel    = channels.find(c => c.id === lead.acquisitionChannelId)
                const leadSource = getLeadSource(channel?.channelType ?? null, lead.trafficSource ?? null)
                const SrcIcon    = SOURCE_ICON[leadSource.kind]
                const langCfg    = LANGUAGE_CONFIG[lead.language]
                const isSelected = selected.has(lead.id)
                const open       = () => navigate(`/leads/${lead.id}`)

                return (
                  <div
                    key={lead.id}
                    className="dt-grid dt-row"
                    data-clickable
                    data-selected={isSelected || undefined}
                    role="link"
                    tabIndex={0}
                    aria-label={`${lead.firstName} ${lead.lastName}`}
                    onClick={open}
                    onKeyDown={onActivate(open)}
                  >
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleSelect(lead) }}
                      onKeyDown={e => e.stopPropagation()}
                      aria-pressed={isSelected}
                      aria-label={isSelected ? 'Deseleccionar lead' : 'Seleccionar lead'}
                      className="check-btn"
                    >
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>

                    {/* Lead */}
                    <div className="lead-who">
                      <LeadAvatar lead={lead} agent={agent} />
                      <div className="dt-cell-main">
                        <div className="lead-name-line">
                          <span className="dt-title">{lead.firstName} {lead.lastName}</span>
                          {lead.urgency === 'hoy' && <TodayChip />}
                        </div>
                        <span className="dt-sub">{lead.email}</span>
                        <TagChips tagIds={lead.tagIds} catalog={tags} />
                        {/* En pantallas medianas y estrechas, lo que sale de sus columnas. */}
                        <span className="dt-meta dt-show-md">
                          {agent && <span>{agent.name.split(' ')[0]}</span>}
                          <span>{channel?.name ?? leadSource.label}</span>
                          <span className="dt-show-sm">{formatDate(lead.createdAt)}</span>
                          <span className="dt-show-sm"><QualityCell band={lead.qualityBand} urgency={null} /></span>
                        </span>
                      </div>
                    </div>

                    {/* Agente */}
                    <span className="cell-inline dt-hide-md">
                      <span className="cell-text">{agent?.name.split(' ')[0] ?? '—'}</span>
                    </span>

                    {/* Etapa */}
                    <span className="dt-hide-sm"><StageBadge stage={lead.stage} /></span>

                    {/* Fuente (composite: channel type / traffic source) */}
                    <span className="cell-inline dt-hide-md">
                      {SrcIcon && <SrcIcon size={13} />}
                      <span className="dt-cell-main">
                        <span className="cell-text">{leadSource.label}</span>
                        {channel && <span className="dt-sub cell-text">{channel.name}</span>}
                      </span>
                    </span>

                    {/* Calidad + urgencia */}
                    <span className="dt-hide-sm"><QualityCell band={lead.qualityBand} urgency={lead.urgency} /></span>

                    {/* Idioma */}
                    <span className="cell-muted dt-hide-md">{langCfg.flag} {lead.language.toUpperCase()}</span>

                    {/* Fecha */}
                    <span className="cell-muted dt-hide-sm">{formatDate(lead.createdAt)}</span>

                    {/* Etapa en pantallas estrechas */}
                    <span className="dt-show-sm"><StageBadge stage={lead.stage} /></span>
                  </div>
                )
              })}

              {/* Paginación — la página la resuelve el servidor vía ?page= */}
              {totalPages > 1 && (
                <div className="pager">
                  <button
                    type="button"
                    onClick={() => pushFilters({ page: Math.max(1, page - 1) })}
                    disabled={page === 1 || isPending}
                    className="btn btn-ghost"
                  >
                    ← Anterior
                  </button>
                  <span>Página {page} de {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => pushFilters({ page: Math.min(totalPages, page + 1) })}
                    disabled={page === totalPages || isPending}
                    className="btn btn-ghost"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          </DataScope>
          )}
        </m.div>
      ) : (

      /* ── Kanban ── Cada columna trae sus más recientes desde el servidor; el
         contador de la cabecera es el total real de la columna. */
        <m.div
          key="kanban"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="kanban"
        >
          {KANBAN_COLUMNS.map(col => {
            const data     = (kanban ?? []).find(c => c.key === col.key)
            const colLeads = data?.items ?? []
            const colTotal = data?.total ?? 0

            return (
              <section key={col.key} className="kanban-col" style={tone(col.color)} aria-label={col.label}>
                <div className="kanban-col-head">
                  <span className="kanban-col-name">{col.label}</span>
                  <span className="filter-tab-count">{colTotal}</span>
                </div>

                {colLeads.length === 0 ? (
                  <div className="kanban-note">Sin leads</div>
                ) : (
                  colLeads.map(lead => {
                    const agent   = agents.find(a => a.id === lead.agentId)
                    const channel = channels.find(c => c.id === lead.acquisitionChannelId)
                    const langCfg = LANGUAGE_CONFIG[lead.language]
                    const open    = () => navigate(`/leads/${lead.id}`)

                    return (
                      <div
                        key={lead.id}
                        className="kanban-card"
                        role="link"
                        tabIndex={0}
                        onClick={open}
                        onKeyDown={onActivate(open)}
                      >
                        <div className="kanban-card-top">
                          <LeadAvatar lead={lead} agent={agent} small />
                          <span className="kanban-card-name">{lead.firstName} {lead.lastName}</span>
                          {lead.urgency === 'hoy' && <TodayChip />}
                          <span className="kanban-card-meta">{formatDate(lead.createdAt)}</span>
                        </div>
                        <span className="kanban-card-meta">{agent?.name.split(' ')[0] ?? '—'}</span>
                        {/* Etiquetas y calidad: el mismo criterio que la tabla, para
                            que las dos vistas no digan cosas distintas del mismo lead. */}
                        <TagChips tagIds={lead.tagIds} catalog={tags} />
                        <QualityCell band={lead.qualityBand} urgency={lead.urgency} />
                        <span className="kanban-card-meta">
                          <span aria-hidden="true">{langCfg.flag}</span>
                          {channel && <span>{CHANNEL_TYPE_LABELS[channel.channelType] ?? channel.channelType}</span>}
                        </span>
                        {/* Sin badge de etapa: cada columna ES una etapa. */}
                      </div>
                    )
                  })
                )}

                {colTotal > colLeads.length && (
                  <div className="kanban-note kanban-note-sm">
                    Mostrando {KANBAN_COLUMN_LIMIT} de {colTotal} · usa la tabla para ver el resto
                  </div>
                )}
              </section>
            )
          })}
        </m.div>
      )}
      </AnimatePresence>
      </div>
      </div>

      {/* ── Eliminar en lote — Paso 1: primera confirmación ── */}
      <ModalShell open={deleteStep === 1} onClose={() => setDeleteStep(0)} maxWidth={460}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <h2 className="settings-modal-title">Eliminar {selected.size} {selected.size === 1 ? 'lead' : 'leads'}</h2>
            <button type="button" onClick={() => setDeleteStep(0)} aria-label="Cerrar" className="icon-btn"><X size={18} /></button>
          </div>
          <p className="settings-confirm-text">
            Vas a eliminar <strong>{selected.size}</strong> {selected.size === 1 ? 'lead' : 'leads'}.
            Se eliminan también sus eventos, runs de secuencia y notificaciones.
          </p>
          <span className="settings-alert settings-alert-block">No se puede deshacer.</span>
          <div className="settings-modal-actions">
            <button type="button" onClick={() => setDeleteStep(0)} className="btn btn-ghost">Cancelar</button>
            <button type="button" onClick={() => { setDeleteStep(2); setDeleteInput('') }} className="btn btn-danger">
              Continuar →
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Eliminar en lote — Paso 2: confirmación por texto ── */}
      <ModalShell open={deleteStep === 2} onClose={() => setDeleteStep(0)} maxWidth={420}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <h2 className="settings-modal-title">Confirmar eliminación</h2>
            <button type="button" onClick={() => setDeleteStep(0)} aria-label="Cerrar" className="icon-btn"><X size={18} /></button>
          </div>
          <p className="settings-confirm-text">
            Para confirmar la eliminación de <strong>{selected.size}</strong> {selected.size === 1 ? 'lead' : 'leads'}, escribe <strong className="settings-input-mono">ELIMINAR</strong>:
          </p>
          <input
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            placeholder="ELIMINAR"
            aria-label="Escribe ELIMINAR para confirmar"
            autoFocus
            className="settings-input settings-input-mono"
          />
          {bulkError && <p role="alert" className="form-error">{bulkError}</p>}
          <div className="settings-modal-actions">
            <button type="button" onClick={() => setDeleteStep(0)} className="btn btn-ghost">Cancelar</button>
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={deleteInput !== 'ELIMINAR' || bulkPending}
              aria-busy={bulkPending}
              className="btn btn-danger"
            >
              {bulkPending ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  )
}
