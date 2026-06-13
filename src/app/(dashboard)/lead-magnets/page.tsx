import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapLeadMagnet, mapAgent, type LeadMagnetRow, type AgentRow } from '@/lib/db'
import type { LeadMagnet, Agent } from '@/lib/types'
import { LMTabs } from './lm-tabs'
import { Download, Users, TrendingUp } from 'lucide-react'

function LMCard({ lm, agent }: { lm: LeadMagnet; agent: Agent }) {
  const stats = { totalDownloads: 0, leadsGenerated: 0, conversionRate: 0, openRate: 0, avgTemperature: 0 }

  return (
    <div
      className="lm-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        overflow: 'hidden',
        borderTop: `3px solid ${agent.accentColor}`,
        transition: 'border-color 0.2s',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Card header */}
      <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>{lm.coverEmoji}</span>
          <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--accent-green)', background: 'rgba(107,163,104,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Activo
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 700, color: agent.accentColor }}>
            {agent.avatarInitials}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agent.name.split(' ')[0]}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px', flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>{lm.title}</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{lm.subtitle}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {lm.monthYear} · {lm.language === 'es' ? '🇪🇸' : lm.language === 'en' ? '🇺🇸' : '🇧🇷'}
        </div>

        {/* Stats 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)', borderRadius: '8px', overflow: 'hidden', margin: '0 0 12px' }}>
          {[
            { value: stats.totalDownloads, label: 'Descargas' },
            { value: stats.leadsGenerated, label: 'Leads gen.' },
            { value: `${stats.conversionRate}%`, label: 'Conversión' },
            { value: `${stats.openRate}%`, label: 'Open rate' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>{s.value}</div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Temperature bar */}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Temp. promedio de leads:</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg-overlay)' }}>
            <div style={{ width: `${stats.avgTemperature}%`, height: '100%', borderRadius: '2px', background: '#C9A96E' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '22px', textAlign: 'right' }}>{stats.avgTemperature}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/leads" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
          Ver leads →
        </Link>
        <a
          href={lm.pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '5px 10px' }}
        >
          <Download size={12} />
          Ver guía
        </a>
      </div>
    </div>
  )
}

function HistoryView({ lms, agents }: { lms: LeadMagnet[]; agents: Agent[] }) {
  const historyLMs = lms.filter(lm => !lm.active)
  const groupedByAgent = agents.map(agent => ({
    agent,
    magnets: historyLMs.filter(lm => lm.agentId === agent.id),
  })).filter(g => g.magnets.length > 0)

  return (
    <div>
      {groupedByAgent.map(({ agent, magnets }) => (
        <div key={agent.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', marginBottom: '12px', borderLeft: `3px solid ${agent.accentColor}` }}>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: agent.accentColor }}>
              {agent.avatarInitials}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</span>
          </div>
          {magnets.map((lm, i) => (
            <div key={lm.id} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{lm.coverEmoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>
                  {lm.title}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>· {lm.monthYear}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>0 descargas · 0 leads · 0% conv. · 0% open</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Link href="/leads" style={{ fontSize: '11px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>Ver leads →</Link>
                <a href={lm.pageUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'none', border: '1px solid var(--border-subtle)', borderRadius: '5px', padding: '4px 8px' }}>
                  <Download size={11} />
                  Ver guía
                </a>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default async function LeadMagnetsPage() {
  const supabase = createAdminClient()

  const [{ data: rawLMs }, { data: rawAgents }] = await Promise.all([
    supabase.from('lead_magnets').select('*').order('created_at', { ascending: false }),
    supabase.from('agents').select('*').eq('active', true),
  ])

  const lms    = (rawLMs    ?? []).map(r => mapLeadMagnet(r as LeadMagnetRow))
  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))
  const activeLMs = lms.filter(lm => lm.active)

  const globalStats = {
    totalDownloads: 0,
    totalLeads:     0,
    avgConversion:  0,
  }

  const kpis = [
    { label: 'Descargas este mes', value: String(globalStats.totalDownloads), icon: <Download size={18} />, color: 'var(--accent-gold)' },
    { label: 'Leads generados',    value: String(globalStats.totalLeads),     icon: <Users size={18} />,    color: '#5B8EC9' },
    { label: 'Conversión promedio', value: `${globalStats.avgConversion}%`,   icon: <TrendingUp size={18} />, color: 'var(--accent-green)' },
  ]

  const activeContent = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {activeLMs.map(lm => {
        const agent = agents.find(a => a.id === lm.agentId)
        if (!agent) return null
        return <LMCard key={lm.id} lm={lm} agent={agent} />
      })}
    </div>
  )

  const historyContent = <HistoryView lms={lms} agents={agents} />

  return (
    <>
      <style>{`.lm-card:hover { border-color: var(--border-accent) !important; }`}</style>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Lead Magnets</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Material gratuito activo · Lead Magnets</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{kpi.label}</span>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(201,169,110,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: kpi.color }}>{kpi.icon}</div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <LMTabs activeContent={activeContent} historyContent={historyContent} />
    </>
  )
}
