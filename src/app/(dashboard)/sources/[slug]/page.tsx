import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelBySlug } from '@/lib/data/channels'
import { getSubmissionsForChannel } from '@/lib/data/form-submissions'
import { listSequences } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { ChannelActions } from './channel-actions'
import { SubmissionsList } from './submissions-list'

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await getCurrentTenantContext()
  const { tenant_id } = ctx
  const scope = scopeFor(ctx)

  // Agent: only their own channel resolves; a non-owned/null channel → 404.
  const channel = await getChannelBySlug(tenant_id, slug, 30, scope.agentId)
  if (!channel) notFound()

  const supabase = createAdminClient()
  const [submissions, sequences, { data: agentRows }] = await Promise.all([
    getSubmissionsForChannel(channel.id, tenant_id),
    listSequences(tenant_id, scope.agentId),
    supabase.from('agents').select('id, name').eq('active', true).eq('tenant_id', channel.tenantId).order('name'),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (agentRows ?? []).map((a: any) => ({ id: a.id as string, name: a.name as string }))

  const typeLabel  = CHANNEL_TYPE_LABELS[channel.channelType] ?? channel.channelType
  const typeColor  = {
    lead_magnet:   'var(--accent-gold)',
    event:         'var(--accent-teal)',
    contact_form:  'var(--accent-blue)',
    manychat_flow: 'var(--accent-green)',
    manual:        'var(--text-muted)',
  }[channel.channelType] ?? 'var(--text-muted)'

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '24px' }}>
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
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '8px' }}>
            {channel.publicId} · slug: {channel.slug}
          </div>
          <span style={{
            fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          }}>
            Agente: {channel.agentName ?? 'Toda la agencia'}
          </span>
        </div>
        <ChannelActions
          channelId={channel.id}
          channelName={channel.name}
          channelActive={channel.active}
          emailSequenceId={channel.emailSequenceId}
          agentId={channel.agentId}
          agents={agents}
          sequences={sequences.filter(s => s.activationType === 'form').map(s => ({ id: s.id, name: s.name }))}
        />
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

      {/* Submissions — expandable Q&A list */}
      <SubmissionsList submissions={submissions} channelType={channel.channelType} />
    </>
  )
}
