import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getLeadDashboardStats, getHotLeads } from '@/lib/data/leads'
import { STATUS_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import { bandForScore } from '@/lib/scoring/temperature-band'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { getRecentActivity } from '@/lib/data/activity'
import { ActivityRow } from '../activity/activity-ui'
import { FadeIn, StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { AnimatedNumber } from '@/components/motion/animated-number'
import { GrowBar } from '@/components/motion/grow-bar'
import type { Agent } from '@/lib/types'
import {
  Flame,
  Users,
  ArrowRightCircle,
  CheckCircle2,
} from 'lucide-react'

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

export default async function DashboardPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  const scope = scopeFor(ctx)
  const isAgent = role === 'agent'
  const supabase = createAdminClient()

  // Los conteos se agregan en Postgres (RPC lead_dashboard_stats) y los leads
  // calientes salen por índice: el dashboard ya no trae la tabla de leads entera
  // para contarla en JS.
  const [leadStats, hotLeads, { data: rawAgents }, recentActivity] = await Promise.all([
    // Scope: tenant (owner/super) + agent_id (agent) — mismo criterio que scopeFor.
    getLeadDashboardStats(scope),
    getHotLeads(scope, 6),
    tenant_id
      ? supabase.from('agents').select('*').eq('active', true).eq('tenant_id', tenant_id)
      : supabase.from('agents').select('*').eq('active', true),
    // Agent: recent activity over their OWN leads; owner/super: tenant-wide (author model).
    getRecentActivity(tenant_id, { role, userId: user_id }, 10, scope.agentId),
  ])

  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  const totalLeads = leadStats.total
  const countOf = (status: string) => leadStats.byStatus[status] ?? 0

  const stats = {
    total:     totalLeads,
    hot:       leadStats.hot,
    inProcess: countOf('process_started'),
    closed:    countOf('closed') + countOf('process_completed'),
  }

  const statusCounts = {
    new:               countOf('new'),
    nurturing:         countOf('nurturing'),
    warm:              countOf('warm'),
    hot:               countOf('hot'),
    process_started:   countOf('process_started'),
    process_completed: countOf('process_completed'),
    closed:            countOf('closed'),
    lost:              countOf('lost'),
  }

  const mainStages = [
    'new', 'nurturing', 'warm', 'hot', 'process_started', 'process_completed', 'closed',
  ] as const

  // `|| 1` evita dividir por cero en un tenant recién creado (todas las barras al mínimo).
  const maxCount = Math.max(...mainStages.map(k => statusCounts[k])) || 1

  function barHeight(count: number): number {
    return Math.max(4, Math.round((count / maxCount) * 48))
  }

  const agentStats: AgentStat[] = agents.map(agent => {
    const row = leadStats.byAgent.find(a => a.agentId === agent.id)
    const total = row?.total ?? 0
    return {
      agent,
      total,
      hot:        row?.hot    ?? 0,
      closed:     row?.closed ?? 0,
      percentage: totalLeads > 0 ? Math.round((total / totalLeads) * 100) : 0,
    }
  })

  const statCards = [
    {
      label: 'Total Leads',
      value: stats.total,
      icon: <Users size={16} />,
      iconColor: 'var(--accent-gold)',
      iconBg:    'color-mix(in srgb, var(--accent-gold) 12%, transparent)',
      desc: 'en el sistema',
    },
    {
      label: 'Leads Calientes',
      value: stats.hot,
      icon: <Flame size={16} />,
      iconColor: 'var(--status-hot)',
      iconBg:    'color-mix(in srgb, var(--status-hot) 12%, transparent)',
      // La leyenda no cita un número: el umbral de la banda lo fija el motor de
      // scoring y los puntos son ajustables por tenant, así que un literal aquí
      // se vuelve mentira en cuanto alguien toca Ajustes → Scoring. Ya pasó: decía
      // "≥ 70" mientras el contador contaba la banda (≥ 60).
      desc: 'en la banda caliente',
    },
    {
      label: 'En Proceso',
      value: stats.inProcess,
      icon: <ArrowRightCircle size={16} />,
      iconColor: 'var(--status-process-started)',
      iconBg:    'color-mix(in srgb, var(--status-process-started) 12%, transparent)',
      desc: 'comprando actualmente',
    },
    {
      label: 'Cerrados',
      value: stats.closed,
      icon: <CheckCircle2 size={16} />,
      iconColor: 'var(--accent-green)',
      iconBg:    'color-mix(in srgb, var(--accent-green) 12%, transparent)',
      desc: 'este ciclo',
    },
  ]

  return (
    // Content gutter is owned by .app-shell-main (single source of truth); no inner
    // padding here — avoids the double-gutter and the dead utility classes.
    <div>
      {/* ── BLOQUE 1: Stats Cards ── */}
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
        {statCards.map(card => (
          <StaggerItem
            key={card.label}
            className="card-interactive"
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
              <AnimatedNumber value={card.value} />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              ↑ {card.desc}
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

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
            {totalLeads} leads
          </span>
        </div>

        {/* Pipeline is horizontal by nature — on phones the lane scrolls sideways
            (max-md:) rather than breaking to a vertical list. Desktop unchanged. */}
        <div className="max-md:overflow-x-auto" style={{ display: 'flex', alignItems: 'flex-end' }}>
          {mainStages.map((key, idx) => {
            const cfg = STATUS_CONFIG[key]
            const count = statusCounts[key]
            const h = barHeight(count)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '76px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 500, color: cfg.color, lineHeight: 1 }}>{count}</span>
                  {/* La altura queda reservada por el div externo: cero layout shift */}
                  <GrowBar
                    axis="y"
                    delay={idx * 0.05}
                    style={{ width: '100%', height: `${h}px`, background: cfg.color + 'CC', borderRadius: '4px' }}
                  />
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
              <GrowBar
                axis="y"
                delay={mainStages.length * 0.05}
                style={{
                  width: '100%',
                  height: `${barHeight(statusCounts.lost)}px`,
                  background: STATUS_CONFIG.lost.color + 'CC',
                  borderRadius: '4px',
                }}
              />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>
                {STATUS_CONFIG.lost.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: Hot Leads + Actividad ── */}
      <FadeIn delay={0.1} className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4" style={{ marginBottom: '24px' }}>

        {/* Leads Calientes */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Leads Calientes</span>
              <span style={{ fontSize: '10px', color: 'var(--status-hot)', background: 'color-mix(in srgb, var(--status-hot) 12%, transparent)', padding: '1px 6px', borderRadius: '4px' }}>
                {hotLeads.length}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--accent-gold)', cursor: 'pointer' }}>Ver todos →</span>
          </div>

          <div>
            {hotLeads.map(lead => {
              const agent  = agents.find(a => a.id === lead.agentId)
              const channelName = lead.channelName ?? '—'
              const initials = getInitials(lead.firstName, lead.lastName)
              const tempColor = bandForScore(lead.score ?? 0).color
              const filled = Math.round((lead.score ?? 0) / 10)
              const cfg = STATUS_CONFIG[lead.status]
              const agentBg = agent ? `${agent.accentColor}26` : 'rgba(255,255,255,0.08)'

              return (
                <div
                  key={lead.id}
                  className="row-hover"
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
                      {agent?.name ?? '—'} · {channelName}
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
                      {lead.score ?? '—'}
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Actividad Reciente</span>
            <Link href="/activity" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
              Ver toda la actividad →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No hay actividad todavía.
            </div>
          ) : (
            <div>
              {recentActivity.map((item, idx) => (
                <div key={item.id}>
                  <ActivityRow item={item} />
                  {idx < recentActivity.length - 1 && (
                    <div style={{ height: '1px', background: 'var(--border-subtle)' }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </FadeIn>

      {/* ── BLOQUE 4: Rendimiento por Agente ── (hidden for role 'agent' — they only see their own leads) */}
      {!isAgent && (
      <FadeIn delay={0.15} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px 20px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Rendimiento por Agente</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Distribución actual de leads</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {agentStats.map(({ agent, total, hot, percentage }) => (
            <div
              key={agent.id}
              className="row-hover"
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

              {/* Name + idiomas */}
              <div style={{ minWidth: '160px' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {agent.languages.map(l => LANGUAGE_CONFIG[l]?.flag ?? l).join(' ')}
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
                {total}/{totalLeads}
              </div>

              {/* Idiomas + hot */}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {agent.languages.map(l => LANGUAGE_CONFIG[l]?.label ?? l).join(', ')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--status-hot)' }}>{hot} calientes</div>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>
      )}
    </div>
  )
}
