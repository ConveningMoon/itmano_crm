import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getChannelBySlug, getChannelLeads } from '@/lib/data/channels'
import { STATUS_CONFIG } from '@/lib/config'
import type { LeadStatus } from '@/lib/types'

const TENANT_ID = 'tenant-aj'

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  ads_meta:        'Meta Ads',
  ads_google:      'Google Ads',
  organic_social:  'Social Orgánico',
  direct:          'Directo',
  manychat_inbound:'ManyChat',
  referral:        'Referido',
  unknown:         'Desconocido',
}

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [channel, leads] = await Promise.all([
    getChannelBySlug(TENANT_ID, slug),
    (async () => {
      const ch = await getChannelBySlug(TENANT_ID, slug)
      if (!ch) return []
      return getChannelLeads(TENANT_ID, ch.id)
    })(),
  ])

  if (!channel) notFound()

  const typeLabel  = CHANNEL_TYPE_LABELS[channel.channelType] ?? channel.channelType
  const typeColor  = {
    lead_magnet:   'var(--accent-gold)',
    event:         'var(--accent-teal)',
    contact_form:  'var(--accent-blue)',
    manychat_flow: 'var(--accent-green)',
    manual:        'var(--text-muted)',
  }[channel.channelType] ?? 'var(--text-muted)'

  // Status funnel breakdown
  const statusCounts: Record<string, number> = {}
  for (const l of leads) {
    statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1
  }

  // Traffic source breakdown
  const sourceCounts: Record<string, number> = {}
  for (const l of leads) {
    const src = l.trafficSource ?? 'unknown'
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1
  }
  const sortedSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])

  return (
    <>
      {/* Back nav */}
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/sources"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={14} />
          Fuentes de Adquisición
        </Link>
      </div>

      {/* Channel header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '24px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {channel.name}
            </h1>
            <span style={{
              fontSize: '10px',
              fontWeight: 500,
              color: typeColor,
              background: `${typeColor}18`,
              padding: '2px 8px',
              borderRadius: '10px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {typeLabel}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 500,
              color: channel.active ? 'var(--accent-green)' : 'var(--text-muted)',
              background: channel.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-overlay)',
              padding: '2px 8px',
              borderRadius: '10px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {channel.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {channel.publicId} · slug: {channel.slug}
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Leads (30d)',     value: String(channel.metrics.leadsInWindow) },
          { label: 'Vistas (30d)',    value: String(channel.metrics.pageViewsInWindow) },
          { label: 'Conversión',      value: `${channel.metrics.conversionRate}%` },
          { label: 'Score promedio',  value: channel.metrics.avgTempScore !== null ? String(channel.metrics.avgTempScore) : '—' },
        ].map((m, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Status funnel */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Estado de leads</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const cfg = STATUS_CONFIG[status as LeadStatus] ?? { label: status, color: 'var(--text-muted)', bgColor: 'var(--bg-overlay)' }
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: '11px',
                    color: cfg.color,
                    background: cfg.bgColor,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 500,
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{count}</span>
                </div>
              )
            })}
            {Object.keys(statusCounts).length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin leads atribuidos</span>
            )}
          </div>
        </div>

        {/* Traffic sources */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Fuente de tráfico</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedSources.map(([src, count]) => (
              <div key={src} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {TRAFFIC_SOURCE_LABELS[src] ?? src}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{count}</span>
              </div>
            ))}
            {sortedSources.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin datos de tráfico</span>
            )}
          </div>
        </div>
      </div>

      {/* Leads table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Leads atribuidos · {leads.length} en total
          </span>
          <Link href={`/leads?channel=${channel.id}`} style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
            Ver todos →
          </Link>
        </div>
        {leads.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No hay leads atribuidos a este canal.
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 120px 100px 90px', gap: '0', padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              {['Nombre', 'Email', 'Estado', 'Score', 'Fuente'].map(h => (
                <span key={h} style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  {h}
                </span>
              ))}
            </div>
            {leads.slice(0, 20).map(lead => {
              const cfg = STATUS_CONFIG[lead.status as LeadStatus] ?? { label: lead.status, color: 'var(--text-muted)', bgColor: 'var(--bg-overlay)' }
              return (
                <div
                  key={lead.id}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 180px 120px 100px 90px', gap: '0', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}
                >
                  <Link href={`/leads/${lead.id}`} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}>
                    {lead.firstName} {lead.lastName}
                  </Link>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.email}
                  </span>
                  <span style={{ fontSize: '11px', color: cfg.color, background: cfg.bgColor, padding: '2px 8px', borderRadius: '4px', fontWeight: 500, width: 'fit-content' }}>
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {lead.temperatureScore !== null ? lead.temperatureScore : '—'}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {TRAFFIC_SOURCE_LABELS[lead.trafficSource ?? ''] ?? lead.trafficSource ?? '—'}
                  </span>
                </div>
              )
            })}
            {leads.length > 20 && (
              <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                <Link href={`/leads?channel=${channel.id}`} style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
                  Ver {leads.length - 20} más →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
