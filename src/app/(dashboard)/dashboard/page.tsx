import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getLeadDashboardStats, getPriorityQueue } from '@/lib/data/leads'
import { LANGUAGE_CONFIG } from '@/lib/config'
import { QUALITY_CONFIG, URGENCY_CONFIG } from '@/lib/scoring/priority'
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
  // Calidad alta, no "calientes": la temperatura salía del score, que decae, así
  // que un agente con leads antiguos parecía peor sin que sus leads lo fueran.
  highQuality: number
  percentage: number
  closed: number
}

// Hex (no var(--...)) porque las barras concatenan el alfa: '#RRGGBB' + 'CC'.
const STAGE_COLORS: Record<string, string> = {
  nuevo:      '#5B8EC9',
  nutricion:  '#C9A96E',
  en_proceso: '#9B72CF',
  cerrado:    '#4A9B6B',
  perdido:    '#C97B6B',
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
  const [leadStats, queue, { data: rawAgents }, recentActivity] = await Promise.all([
    // Scope: tenant (owner/super) + agent_id (agent) — mismo criterio que scopeFor.
    getLeadDashboardStats(scope),
    getPriorityQueue(scope, 6),
    tenant_id
      ? supabase.from('agents').select('*').eq('active', true).eq('tenant_id', tenant_id)
      : supabase.from('agents').select('*').eq('active', true),
    // Agent: recent activity over their OWN leads; owner/super: tenant-wide (author model).
    getRecentActivity(tenant_id, { role, userId: user_id }, 10, scope.agentId),
  ])

  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  const totalLeads = leadStats.total

  const stats = {
    active:      leadStats.active,
    highQuality: leadStats.highQuality,
    urgentToday: leadStats.urgentToday,
    closedMonth: leadStats.closedThisMonth,
  }

  // Embudo por ETAPA (4 columnas reales) en vez de barras por los 8 `status`.
  // La tasa de paso entre etapas es lo que una agencia quiere saber de su
  // operación y hoy no existía en ninguna pantalla.
  const stageOf = (k: string) => leadStats.byStage[k] ?? 0
  const funnel = [
    { key: 'nuevo',      label: 'Nuevo',        count: stageOf('nuevo') },
    { key: 'nutricion',  label: 'En Nutrición', count: stageOf('nutricion') },
    { key: 'en_proceso', label: 'En proceso',   count: stageOf('en_proceso') },
    { key: 'cerrado',    label: 'Cerrado',      count: stageOf('cerrado') },
  ]
  // Cada barra son los leads que están AHORA en esa etapa — el mismo número que
  // el kanban, comprobable abriendo la lista.
  //
  // Antes mostraba un acumulado hacia atrás ("un cerrado también pasó por
  // nuevo") con la etiqueta de la etapa, así que "Nuevo 4" salía con 1 solo lead
  // en Nuevo y nadie podía reconciliarlo con nada. Y el acumulado además daba
  // por hecho que todos pasan por Nutrición, que es opcional: un lead puede ir
  // de Nuevo a En proceso directo.
  //
  // La tasa de paso REAL vive en lead_status_history, no aquí. Mientras esa
  // tabla no tenga las transiciones de este tenant, cualquier porcentaje que
  // pintáramos sería inventado — y un número inventado en un panel es peor que
  // no tener el número.
  const funnelMax = Math.max(...funnel.map(f => f.count), 1)
  // Los leads traídos de otro CRM quedan FUERA del embudo (migración 080): no
  // recorrieron estas etapas aquí, y contarlos daba un 100% de paso inventado.
  // Se dicen aparte para que el total del embudo no parezca un lead perdido.
  const importedLeads = leadStats.imported
  const funnelTotal   = funnel.reduce((sum, f) => sum + f.count, 0) + stageOf('perdido')

  const agentStats: AgentStat[] = agents.map(agent => {
    const row = leadStats.byAgent.find(a => a.agentId === agent.id)
    const total = row?.total ?? 0
    return {
      agent,
      total,
      highQuality: row?.highQuality ?? 0,
      closed:      row?.closed      ?? 0,
      percentage: totalLeads > 0 ? Math.round((total / totalLeads) * 100) : 0,
    }
  })

  const statCards = [
    {
      label: 'Cartera activa',
      value: stats.active,
      icon: <Users size={16} />,
      iconColor: 'var(--accent-gold)',
      iconBg:    'color-mix(in srgb, var(--accent-gold) 12%, transparent)',
      desc: 'nuevos y en nutrición',
    },
    {
      label: 'Calidad alta',
      value: stats.highQuality,
      icon: <Flame size={16} />,
      iconColor: 'var(--status-hot)',
      iconBg:    'color-mix(in srgb, var(--status-hot) 12%, transparent)',
      desc: 'lo mejor de tu cartera',
    },
    {
      label: 'Para hoy',
      value: stats.urgentToday,
      icon: <ArrowRightCircle size={16} />,
      iconColor: 'var(--accent-coral)',
      iconBg:    'color-mix(in srgb, var(--accent-coral) 12%, transparent)',
      desc: 'necesitan acción hoy',
    },
    {
      label: 'Cerrados',
      value: stats.closedMonth,
      icon: <CheckCircle2 size={16} />,
      iconColor: 'var(--accent-green)',
      iconBg:    'color-mix(in srgb, var(--accent-green) 12%, transparent)',
      desc: 'este mes',
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
          <div>
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Embudo</span>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Cuántos leads llegaron a cada etapa, y qué porcentaje pasó a la siguiente
              {importedLeads > 0 && (
                <> · {importedLeads} importados de otro CRM quedan fuera</>
              )}
            </div>
          </div>
          <span style={{
            fontSize: '11px', color: 'var(--accent-gold)',
            background: 'rgba(201,169,110,0.12)', padding: '2px 8px', borderRadius: '4px',
          }}>
            {funnelTotal} leads
          </span>
        </div>

        {/* Dónde está la cartera AHORA: una barra por etapa, con el número que
            se ve en el kanban. Sin acumulados ni porcentajes derivados de una
            suposición — ver el comentario del cálculo. */}
        <div className="max-md:overflow-x-auto" style={{ display: 'flex', alignItems: 'flex-end' }}>
          {funnel.map((stage, idx) => {
            const h = Math.max(4, Math.round((stage.count / funnelMax) * 48))
            const color = STAGE_COLORS[stage.key]
            return (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '92px' }}>
                  <span style={{ fontSize: '22px', fontWeight: 500, color, lineHeight: 1 }}>{stage.count}</span>
                  <GrowBar
                    axis="y"
                    delay={idx * 0.05}
                    style={{ width: '100%', height: `${h}px`, background: color + 'CC', borderRadius: '4px' }}
                  />
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                    {stage.label}
                  </span>
                </div>
              </div>
            )
          })}

          {/* Perdidos — salida del embudo, no una etapa más */}
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: '8px' }}>
            <span style={{ color: 'var(--border-subtle)', fontSize: '24px', paddingBottom: '28px', margin: '0 8px' }}>|</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '60px' }}>
              <span style={{ fontSize: '22px', fontWeight: 500, color: STAGE_COLORS.perdido, lineHeight: 1 }}>
                {stageOf('perdido')}
              </span>
              <GrowBar
                axis="y"
                delay={funnel.length * 0.05}
                style={{
                  width: '100%',
                  height: `${Math.max(4, Math.round((stageOf('perdido') / funnelMax) * 48))}px`,
                  background: STAGE_COLORS.perdido + 'CC',
                  borderRadius: '4px',
                }}
              />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'center' }}>
                Perdido
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BLOQUE 3: Hot Leads + Actividad ── */}
      <FadeIn delay={0.1} className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-4" style={{ marginBottom: '24px' }}>

        {/* Tu cola de hoy — reemplaza "Leads Calientes". Un lead caliente que ya
            está en proceso no es trabajo pendiente, y uno mediocre que acaba de
            responder sí; ordenar por score no distinguía ninguno de los dos. */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Tu cola de hoy</span>
              <span style={{ fontSize: '10px', color: 'var(--accent-gold)', background: 'color-mix(in srgb, var(--accent-gold) 12%, transparent)', padding: '1px 6px', borderRadius: '4px' }}>
                {queue.length}
              </span>
            </div>
            <Link href="/leads?sort=prioridad" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none' }}>
              Ver todos →
            </Link>
          </div>

          <div>
            {queue.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px' }}>
                No hay leads activos en tu cartera.
              </div>
            )}
            {queue.map(lead => {
              const agent    = agents.find(a => a.id === lead.agentId)
              const initials = getInitials(lead.firstName, lead.lastName)
              const agentBg  = agent ? `${agent.accentColor}26` : 'rgba(255,255,255,0.08)'
              const q        = QUALITY_CONFIG[lead.qualityBand]

              return (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="row-hover"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: '8px', textDecoration: 'none',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: agentBg,
                    color:      agent?.accentColor ?? 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '11px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {lead.firstName} {lead.lastName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {agent?.name ?? '—'} · {lead.channelName ?? '—'}
                    </div>
                  </div>

                  {/* Urgencia — sólo cuando hay algo que hacer */}
                  {lead.urgency && lead.urgency !== 'sin_apuro' && (
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
                      color: URGENCY_CONFIG[lead.urgency].color,
                      background: `color-mix(in srgb, ${URGENCY_CONFIG[lead.urgency].color} 14%, transparent)`,
                      whiteSpace: 'nowrap',
                    }}>
                      {URGENCY_CONFIG[lead.urgency].label}
                    </span>
                  )}

                  <span style={{
                    fontSize: '10px', padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
                    color: q.color, background: `color-mix(in srgb, ${q.color} 14%, transparent)`,
                    whiteSpace: 'nowrap',
                  }}>
                    {q.label}
                  </span>
                </Link>
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
          {agentStats.map(({ agent, total, highQuality, percentage }) => (
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

              {/* Idiomas + calidad alta */}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {agent.languages.map(l => LANGUAGE_CONFIG[l]?.label ?? l).join(', ')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--status-hot)' }}>{highQuality} de calidad alta</div>
              </div>
            </div>
          ))}
        </div>
      </FadeIn>
      )}
    </div>
  )
}
