import Link from 'next/link'
import {
  MOCK_AGENTS,
  MOCK_LEAD_MAGNETS,
  type LeadMagnet,
  getActiveLMs,
} from '@/lib/mockdata'
import { LMTabs } from './lm-tabs'
import { Download, Users, TrendingUp } from 'lucide-react'

const LANG_FLAG: Record<string, string> = { es: '🇪🇸', en: '🇺🇸', pt: '🇧🇷' }

function tempColor(score: number): string {
  if (score >= 70) return '#E04040'
  if (score >= 40) return '#E07B3A'
  return '#C9A96E'
}

// ─── Card for active LMs ─────────────────────────────────────────────────────

function LMCard({ lm }: { lm: LeadMagnet }) {
  const agent = MOCK_AGENTS.find(a => a.id === lm.agentId)
  if (!agent) return null
  const barColor = tempColor(lm.stats.avgTemperature)
  const barWidth = lm.stats.avgTemperature

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
      <div style={{
        background: 'var(--bg-elevated)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px', lineHeight: 1 }}>{lm.coverEmoji}</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 500,
            color: 'var(--accent-green)',
            background: 'rgba(107,163,104,0.12)',
            padding: '2px 8px',
            borderRadius: '10px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Activo
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: `${agent.accentColor}22`,
            border: `1px solid ${agent.accentColor}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            fontWeight: 700,
            color: agent.accentColor,
            flexShrink: 0,
          }}>
            {agent.avatarInitials}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agent.name.split(' ')[0]}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px', flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {lm.title}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          {lm.subtitle}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {lm.monthYear} · {LANG_FLAG[lm.language]}
        </div>

        {/* Stats 2×2 grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: 'var(--border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden',
          margin: '0 0 12px',
        }}>
          {[
            { value: lm.stats.totalDownloads, label: 'Descargas' },
            { value: lm.stats.leadsGenerated, label: 'Leads gen.' },
            { value: `${lm.stats.conversionRate}%`, label: 'Conversión' },
            { value: `${lm.stats.openRate}%`, label: 'Open rate' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: '2px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Temperature bar */}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          Temp. promedio de leads:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--bg-overlay)' }}>
            <div style={{ width: `${barWidth}%`, height: '100%', borderRadius: '2px', background: barColor }} />
          </div>
          <span style={{ fontSize: '11px', color: barColor, minWidth: '22px', textAlign: 'right' }}>
            {lm.stats.avgTemperature}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Link
          href="/leads"
          style={{
            fontSize: '12px',
            color: 'var(--accent-gold)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Ver leads →
        </Link>
        <a
          href={lm.downloadUrl}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '5px 10px',
          }}
        >
          <Download size={12} />
          Ver guía
        </a>
      </div>
    </div>
  )
}

// ─── History list view ────────────────────────────────────────────────────────

function HistoryView() {
  const historyLMs = MOCK_LEAD_MAGNETS.filter(lm => !lm.active)
  const groupedByAgent = MOCK_AGENTS.map(agent => ({
    agent,
    magnets: historyLMs.filter(lm => lm.agentId === agent.id),
  })).filter(g => g.magnets.length > 0)

  return (
    <div>
      {groupedByAgent.map(({ agent, magnets }) => (
        <div
          key={agent.id}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '12px',
            borderLeft: `3px solid ${agent.accentColor}`,
          }}
        >
          {/* Agent header */}
          <div style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: `${agent.accentColor}22`,
              border: `1px solid ${agent.accentColor}44`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '10px',
              fontWeight: 700,
              color: agent.accentColor,
              flexShrink: 0,
            }}>
              {agent.avatarInitials}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {agent.name}
            </span>
          </div>

          {/* Magnets list */}
          {magnets.map((lm, i) => (
            <div
              key={lm.id}
              style={{
                padding: '12px 16px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{lm.coverEmoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '2px' }}>
                  {lm.title}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                    · {lm.monthYear}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {lm.stats.totalDownloads} descargas · {lm.stats.leadsGenerated} leads · {lm.stats.conversionRate}% conv. · {lm.stats.openRate}% open
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Link
                  href="/leads"
                  style={{ fontSize: '11px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}
                >
                  Ver leads →
                </Link>
                <a
                  href={lm.downloadUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '5px',
                    padding: '4px 8px',
                  }}
                >
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadMagnetsPage() {
  const activeLMs = getActiveLMs()

  const globalStats = {
    totalDownloads: activeLMs.reduce((s, lm) => s + lm.stats.totalDownloads, 0),
    totalLeads:     activeLMs.reduce((s, lm) => s + lm.stats.leadsGenerated, 0),
    avgConversion:  Math.round(
      activeLMs.reduce((s, lm) => s + lm.stats.conversionRate, 0) / activeLMs.length
    ),
  }

  const kpis = [
    { label: 'Descargas este mes', value: String(globalStats.totalDownloads), icon: <Download size={18} />, color: 'var(--accent-gold)' },
    { label: 'Leads generados',    value: String(globalStats.totalLeads),     icon: <Users size={18} />,    color: '#5B8EC9' },
    { label: 'Conversión promedio', value: `${globalStats.avgConversion}%`,   icon: <TrendingUp size={18} />, color: 'var(--accent-green)' },
  ]

  const activeContent = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {activeLMs.map(lm => <LMCard key={lm.id} lm={lm} />)}
    </div>
  )

  const historyContent = <HistoryView />

  return (
    <>
      <style>{`
        .lm-card:hover { border-color: var(--border-accent) !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Lead Magnets
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Material gratuito activo este mes · Abr 2026
        </p>
      </div>

      {/* Global stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {kpi.label}
              </span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: `${kpi.color === 'var(--accent-gold)' ? 'rgba(201,169,110' : kpi.color === '#5B8EC9' ? 'rgba(91,142,201' : 'rgba(107,163,104'},0.12)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: kpi.color,
              }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <LMTabs activeContent={activeContent} historyContent={historyContent} />
    </>
  )
}
