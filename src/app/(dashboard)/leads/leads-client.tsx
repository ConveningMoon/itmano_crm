'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, List, LayoutGrid, ChevronDown, X, Users } from 'lucide-react'
import { STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource, LeadStatus } from '@/lib/types'

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
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
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
  leads: Lead[]
  agents: Agent[]
  sources: LeadSource[]
}

export function LeadsClient({ leads, agents, sources }: LeadsClientProps) {
  const router = useRouter()

  const [view, setView]               = useState<'table' | 'kanban'>('table')
  const [search, setSearch]           = useState('')
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterStatus, setFilterStatus]   = useState('all')
  const [filterSource, setFilterSource]   = useState('all')
  const [filterLanguage, setFilterLanguage] = useState('all')
  const [page, setPage] = useState(1)

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const fullName = `${lead.firstName} ${lead.lastName}`.toLowerCase()
      const matchSearch =
        search === '' ||
        fullName.includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase())

      const matchAgent    = filterAgent === 'all' || lead.agentId === filterAgent
      const matchStatus   = filterStatus === 'all' || lead.status === filterStatus
      const source        = sources.find(s => s.id === lead.sourceId)
      const matchSource   = filterSource === 'all' || source?.type === filterSource
      const matchLanguage = filterLanguage === 'all' || lead.language === filterLanguage

      return matchSearch && matchAgent && matchStatus && matchSource && matchLanguage
    })
  }, [leads, sources, search, filterAgent, filterStatus, filterSource, filterLanguage])

  useEffect(() => {
    setPage(1)
  }, [search, filterAgent, filterStatus, filterSource, filterLanguage])

  const hotCount    = filteredLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length
  const totalPages  = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE)
  const pagedLeads  = filteredLeads.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
  const hasActiveFilters =
    search !== '' ||
    filterAgent !== 'all' ||
    filterStatus !== 'all' ||
    filterSource !== 'all' ||
    filterLanguage !== 'all'

  function clearFilters() {
    setSearch('')
    setFilterAgent('all')
    setFilterStatus('all')
    setFilterSource('all')
    setFilterLanguage('all')
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
    { value: 'all',         label: 'Todas las fuentes' },
    { value: 'lead_magnet', label: 'Lead Magnet' },
    { value: 'web_form',    label: 'Formulario Web' },
    { value: 'open_house',  label: 'Open House' },
    { value: 'manual',      label: 'Registro Manual' },
    { value: 'ads',         label: 'Meta Ads' },
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
    if (opt) activeChips.push({ label: opt.label, onRemove: () => setFilterSource('all') })
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
      <style>{`
        .table-row:hover  { background: var(--bg-elevated); }
        .kanban-card { transition: border-color 150ms, transform 150ms; }
        .kanban-card:hover { border-color: var(--border-accent) !important; transform: translateY(-1px); }
        .filter-input:focus { border-color: var(--border-accent) !important; outline: none; }
        .clear-btn:hover { color: var(--text-secondary) !important; }
        .page-btn:not(:disabled):hover { border-color: var(--border-accent) !important; color: var(--text-primary) !important; }
      `}</style>

      {/* ── ZONA 1: Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Leads</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {filteredLeads.length} leads · {hotCount} calientes
          </div>
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

        <FilterSelect value={filterAgent}    onChange={setFilterAgent}    options={agentOptions} />
        <FilterSelect value={filterStatus}   onChange={setFilterStatus}   options={statusOptions} />
        <FilterSelect value={filterSource}   onChange={setFilterSource}   options={sourceOptions} />
        <FilterSelect value={filterLanguage} onChange={setFilterLanguage} options={languageOptions} />

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

      {/* ── ZONA 3A: Table view ── */}
      {view === 'table' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
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
                  <td colSpan={7}>
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
                  const agent     = agents.find(a => a.id === lead.agentId)
                  const source    = sources.find(s => s.id === lead.sourceId)
                  const sourceCfg = source ? SOURCE_CONFIG[source.type] : null
                  const langCfg   = LANGUAGE_CONFIG[lead.language]
                  const isLast    = idx === pagedLeads.length - 1

                  return (
                    <tr
                      key={lead.id}
                      className="table-row"
                      style={{
                        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
                        cursor: 'pointer',
                      }}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      {/* Lead */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <LeadAvatar lead={lead} agents={agents} size={32} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {lead.firstName} {lead.lastName}
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
                      {/* Fuente */}
                      <td style={{ padding: '12px 16px', width: '140px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {sourceCfg?.icon ?? ''} {source?.name ?? '—'}
                        </span>
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
        </div>
      )}

      {/* ── ZONA 3B: Kanban view ── */}
      {view === 'kanban' && (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', minHeight: 'calc(100vh - 280px)' }}>
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
                    const agent     = agents.find(a => a.id === lead.agentId)
                    const source    = sources.find(s => s.id === lead.sourceId)
                    const sourceCfg = source ? SOURCE_CONFIG[source.type] : null
                    const langCfg   = LANGUAGE_CONFIG[lead.language]

                    return (
                      <div
                        key={lead.id}
                        className="kanban-card"
                        style={{
                          background:   'var(--bg-elevated)',
                          border:       '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding:      '10px 12px',
                          marginBottom: '8px',
                          cursor:       'pointer',
                        }}
                        onClick={() => router.push(`/leads/${lead.id}`)}
                      >
                        {/* Row 1: avatar + name + date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <LeadAvatar lead={lead} agents={agents} size={24} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.firstName} {lead.lastName}
                            </div>
                          </div>
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
                        {/* Row 4: language + source */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{langCfg.flag}</span>
                          {sourceCfg && (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {sourceCfg.icon} {sourceCfg.label}
                            </span>
                          )}
                        </div>
                        {/* Status badge only in 'finished' column */}
                        {col.key === 'finished' && (
                          <div style={{ marginTop: '6px' }}>
                            <StatusBadge status={lead.status} />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
