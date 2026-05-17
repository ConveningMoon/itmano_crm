import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, mapLead, type LeadRow, type AgentRow, type LeadEventRow } from '@/lib/db'
import { STATUS_CONFIG, SOURCE_CONFIG } from '@/lib/config'
import type { Agent } from '@/lib/types'
import {
  Flame,
  Users,
  ArrowRightCircle,
  CheckCircle2,
  Mail,
  FileDown,
  Calendar,
  UserPlus,
} from 'lucide-react'

type ActivityItem = {
  time: string
  text: string
  icon: string
  color: string
}

const EVENT_META: Record<string, { icon: string; color: string }> = {
  lead_created:   { icon: 'UserPlus',         color: '#5B8EC9' },
  status_changed: { icon: 'ArrowRightCircle', color: '#9B72CF' },
  email_sent:     { icon: 'Mail',             color: '#5AAFA0' },
  download:       { icon: 'FileDown',          color: '#B87BA3' },
  appointment:    { icon: 'Calendar',          color: '#C9A96E' },
  process_closed: { icon: 'CheckCircle2',      color: '#6BA368' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Ahora mismo'
  if (mins < 60)  return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

type AgentStat = {
  agent: Agent
  total: number
  hot: number
  percentage: number
  closed: number
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

function getTempColor(score: number): string {
  if (score >= 70) return '#E04040'
  if (score >= 40) return '#E07B3A'
  return '#C9A96E'
}

function ActivityIcon({ name }: { name: string }) {
  const props = { size: 16 }
  switch (name) {
    case 'ArrowRightCircle': return <ArrowRightCircle {...props} />
    case 'Mail':             return <Mail {...props} />
    case 'FileDown':         return <FileDown {...props} />
    case 'Calendar':         return <Calendar {...props} />
    case 'UserPlus':         return <UserPlus {...props} />
    case 'CheckCircle2':     return <CheckCircle2 {...props} />
    default:                 return null
  }
}

export default async function DashboardPage() {
  const supabase = createAdminClient()

  const [{ data: rawLeads }, { data: rawAgents }, { data: rawEvents }] = await Promise.all([
    supabase.from('leads').select('*, lead_sources(*)').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
    supabase.from('lead_events').select('*').order('created_at', { ascending: false }).limit(10),
  ])

  const leads = (rawLeads ?? []).map(r => mapLead(r as LeadRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  const stats = {
    total:     leads.length,
    hot:       leads.filter(l => l.status === 'hot' || (l.temperatureScore ?? 0) >= 70).length,
    inProcess: leads.filter(l => l.status === 'process_started').length,
    closed:    leads.filter(l => l.status === 'closed' || l.status === 'process_completed').length,
  }

  const hotLeads = leads
    .filter(l => (l.temperatureScore ?? 0) >= 70)
    .sort((a, b) => (b.temperatureScore ?? 0) - (a.temperatureScore ?? 0))
    .slice(0, 6)

  const statusCounts = {
    new:               leads.filter(l => l.status === 'new').length,
    nurturing:         leads.filter(l => l.status === 'nurturing').length,
    warm:              leads.filter(l => l.status === 'warm').length,
    hot:               leads.filter(l => l.status === 'hot').length,
    process_started:   leads.filter(l => l.status === 'process_started').length,
    process_completed: leads.filter(l => l.status === 'process_completed').length,
    closed:            leads.filter(l => l.status === 'closed').length,
    lost:              leads.filter(l => l.status === 'lost').length,
  }

  const mainStages = [
    'new', 'nurturing', 'warm', 'hot', 'process_started', 'process_completed', 'closed',
  ] as const

  const maxCount = Math.max(...mainStages.map(k => statusCounts[k]))

  function barHeight(count: number): number {
    return Math.max(4, Math.round((count / maxCount) * 48))
  }

  const agentStats: AgentStat[] = agents.map(agent => {
    const agentLeads = leads.filter(l => l.agentId === agent.id)
    const total = agentLeads.length
    const hot = agentLeads.filter(l => (l.temperatureScore ?? 0) >= 70).length
    const percentage = Math.round((total / leads.length) * 100)
    const closed = agentLeads.filter(
      l => l.status === 'closed' || l.status === 'process_completed'
    ).length
    return { agent, total, hot, percentage, closed }
  })

  const recentActivity: ActivityItem[] = (rawEvents ?? []).map(r => {
    const event = r as LeadEventRow
    const meta  = EVENT_META[event.type] ?? { icon: 'ArrowRightCircle', color: '#C9A96E' }
    return { time: timeAgo(event.created_at), text: event.description, icon: meta.icon, color: meta.color }
  })

  const specialtyLabel: Record<string, string> = {
    hispanic:    'Familias Hispanas',
    military:    'Familias Militares',
    first_buyer: 'Primeros Compradores',
    brazilian:   'Comunidad Brasileña',
  }

  const statCards = [
    {
      label: 'Total Leads',
      value: stats.total,
      icon: <Users size={16} />,
      iconColor: '#C9A96E',
      iconBg:    'rgba(201,169,110,0.12)',
      desc: 'en el sistema',
    },
    {
      label: 'Leads Calientes',
      value: stats.hot,
      icon: <Flame size={16} />,
      iconColor: '#E04040',
      iconBg:    'rgba(224,64,64,0.12)',
      desc: 'temperatura ≥ 70',
    },
    {
      label: 'En Proceso',
      value: stats.inProcess,
      icon: <ArrowRightCircle size={16} />,
      iconColor: '#9B72CF',
      iconBg:    'rgba(155,114,207,0.12)',
      desc: 'comprando actualmente',
    },
    {
      label: 'Cerrados',
      value: stats.closed,
      icon: <CheckCircle2 size={16} />,
      iconColor: '#6BA368',
      iconBg:    'rgba(107,163,104,0.12)',
      desc: 'este ciclo',
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <style>{`
        .stat-card { transition: border-color 200ms, transform 200ms; }
        .stat-card:hover { border-color: var(--border-accent) !important; transform: translateY(-1px); }
        .lead-row:hover  { background: var(--bg-elevated); }
        .agent-row:hover { background: var(--bg-elevated); }
      `}</style>

      {/* ── BLOQUE 1: Stats Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
        {statCards.map(card => (
          <div
            key={card.label}
            className="stat-card"
            style={{
              background:   'var(--bg-surface)',
              border:       '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding:      '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div style={{
                width:        '32px',
                height:       '32px',
                borderRadius: '8px',
                background:   card.iconBg,
                color:        card.iconColor,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
              }}>
                {card.icon}
              </div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500 }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, marginBottom: '8px' }}>
              {card.value}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              ↑ {card.desc}
            </div>
          </div>
        ))}
      </div>

      {/* ── BLOQUE 2: Pipeline Visual ── */}
      <div style={{
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding:      '20px 24px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Pipeline de Leads</span>
          <span style={{
            fontSize: '11px', color: 'var(--accent-gold)',
            background: 'rgba(201,169,110,0.12)', padding: '2px 8px', borderRadius: '4px',
          }}>
            {leads.length} leads
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {mainStages.map((key, idx) => {
            const cfg = STATUS_CONFIG[key]
            const count = statusCounts[key]
            const h = barHeight(count)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '76px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: cfg.color, lineHeight: 1 }}>{count}</span>
                  <div style={{ width: '100%', height: `${h}px`, background: cfg.color + 'CC', borderRadius: '4px' }} />
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                    {cfg.label}
                  </span>
                </div>
                {idx < mainStages.length - 1 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 2px', paddingBottom: '28px' }}>→</span>
                )}
              </div>
            )
          })}

          {/* Lost — exit from flow */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '8px' }}>
            <span style={{ color: 'var(--border-subtle)', fontSize: '24px', paddingBottom: '28px', margin: '0 8px' }}>|</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '60px' }}>
              <span style={{ fontSize: '22px', fontWeight: 500, color: STATUS_CONFIG.lost.color, lineHeight: 1 }}>
                {statusCounts.lost}
              </span>
              <div style={{
                width: '100%',
                height: `${barHeight(statusCounts.lost)}px`,
                background: STATUS_CONFIG.lost.color + 'CC',
                borderRadius: '4px',
              }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>
                {STATUS_CONFIG.lost.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: Hot Leads + Actividad ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', marginBottom: '24px' }}>

        {/* Leads Calientes */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Leads Calientes</span>
              <span style={{ fontSize: '10px', color: '#E04040', background: 'rgba(224,64,64,0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                {hotLeads.length}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--accent-gold)', cursor: 'pointer' }}>Ver todos →</span>
          </div>

          <div>
            {hotLeads.map(lead => {
              const agent  = agents.find(a => a.id === lead.agentId)
              const raw = (rawLeads ?? []).find(r => r.id === lead.id) as any
              const sourceType = raw?.lead_sources?.type ?? 'manual'
              const sourceLabel = SOURCE_CONFIG[sourceType as keyof typeof SOURCE_CONFIG]?.label ?? '—'
              const initials = getInitials(lead.firstName, lead.lastName)
              const tempColor = getTempColor(lead.temperatureScore ?? 0)
              const filled = Math.round((lead.temperatureScore ?? 0) / 10)
              const cfg = STATUS_CONFIG[lead.status]
              const agentBg = agent ? `${agent.accentColor}26` : 'rgba(255,255,255,0.08)'

              return (
                <div
                  key={lead.id}
                  className="lead-row"
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'default' }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: agentBg,
                    color:      agent?.accentColor ?? 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lead.firstName} {lead.lastName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {agent?.name ?? '—'} · {sourceLabel}
                    </div>
                  </div>

                  {/* Temperature bar + score */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {Array.from({ length: 10 }, (_, i) => (
                        <div key={i} style={{
                          width: '6px', height: '6px', borderRadius: '2px',
                          background: i < filled ? tempColor : 'var(--bg-overlay)',
                        }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '13px', color: tempColor, fontWeight: 500, width: '26px', textAlign: 'right' }}>
                      {lead.temperatureScore ?? '—'}
                    </span>
                  </div>

                  {/* Status badge */}
                  <div style={{
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                    background: cfg.bgColor, color: cfg.color,
                    flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {cfg.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Actividad Reciente */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Actividad Reciente</span>
          </div>
          <div>
            {recentActivity.map((item, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', gap: '10px', padding: '8px 0' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: `${item.color}1F`,
                    color: item.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <ActivityIcon name={item.icon} />
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.text}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.time}</div>
                  </div>
                </div>
                {idx < recentActivity.length - 1 && (
                  <div style={{ height: '1px', background: 'var(--border-subtle)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BLOQUE 4: Rendimiento por Agente ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px 20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Rendimiento por Agente</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Distribución actual de leads</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {agentStats.map(({ agent, total, hot, percentage }) => (
            <div
              key={agent.id}
              className="agent-row"
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          '12px',
                padding:      '12px 16px',
                borderRadius: '8px',
                borderLeft:   `3px solid ${agent.accentColor}`,
                cursor:       'default',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: `${agent.accentColor}26`,
                color:      agent.accentColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 600, flexShrink: 0,
              }}>
                {agent.avatarInitials}
              </div>

              {/* Name + role */}
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {agent.specialty === 'hispanic' ? 'agent_owner' : 'agent'}
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ width: '180px', height: '4px', background: 'var(--bg-overlay)', borderRadius: '2px', marginBottom: '4px' }}>
                  <div style={{ width: `${percentage}%`, height: '100%', background: agent.accentColor, borderRadius: '2px' }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{percentage}%</div>
              </div>

              {/* Count */}
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {total}/{leads.length}
              </div>

              {/* Specialty + hot */}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{specialtyLabel[agent.specialty]}</div>
                <div style={{ fontSize: '11px', color: '#E04040' }}>{hot} calientes</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
