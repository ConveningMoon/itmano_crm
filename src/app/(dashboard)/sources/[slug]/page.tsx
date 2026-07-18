import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelBySlug } from '@/lib/data/channels'
import { getSubmissionsForChannel } from '@/lib/data/form-submissions'
import { listSequences } from '@/lib/data/email-sequences'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { ChannelActions } from './channel-actions'
import { SubmissionsList } from './submissions-list'
import { SourceTabs } from './source-tabs'
import { PageOptions } from './page-options'
import { parseHostedPage } from '@/lib/hosted-page'

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
  const ctx = await requireTenantContext()
  const { tenant_id } = ctx
  const scope = scopeFor(ctx)

  // Agent: only their own channel resolves; a non-owned/null channel → 404.
  const channel = await getChannelBySlug(tenant_id, slug, 30, scope.agentId)
  if (!channel) notFound()

  const supabase = createAdminClient()
  const [submissions, sequences, { data: agentRows }, { data: hostedRow }, { data: tenantRow }] = await Promise.all([
    getSubmissionsForChannel(channel.id, tenant_id),
    listSequences(tenant_id, scope.agentId),
    supabase.from('agents').select('id, name').eq('active', true).eq('tenant_id', channel.tenantId).order('name'),
    supabase.from('acquisition_channels').select('hosted_page, page_managed_by_itmano').eq('id', channel.id).maybeSingle(),
    supabase.from('tenants').select('slug, name').eq('id', channel.tenantId).maybeSingle(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hostedConfig = parseHostedPage((hostedRow as any)?.hosted_page)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageManaged = !!((hostedRow as any)?.page_managed_by_itmano)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantName = ((tenantRow as any)?.name as string | undefined) ?? undefined
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

      <SourceTabs
        general={<>
      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" style={{ marginBottom: '24px' }}>
        {/* Leads totales — links to /leads pre-filtered by this channel */}
        <Link
          href={`/leads?source=${channel.channelType}&channelId=${channel.id}`}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '12px', padding: '16px', textDecoration: 'none',
            display: 'block', transition: 'border-color 150ms',
          }}
          className="metric-link"
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
            Leads totales
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {channel.metrics.leadsTotal}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            Ver leads <ArrowRight size={10} />
          </div>
        </Link>

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

      <style>{`.metric-link:hover { border-color: var(--accent-gold) !important; }`}</style>

      {/* Submissions — expandable Q&A list */}
      <SubmissionsList submissions={submissions} channelType={channel.channelType} />
        </>}
        pagina={
          ['lead_magnet', 'event', 'contact_form'].includes(channel.channelType) && tenantSlug ? (
            <PageOptions
              channelId={channel.id}
              channelType={channel.channelType}
              channelName={channel.name}
              publicId={channel.publicId}
              tenantSlug={tenantSlug}
              channelSlug={channel.slug}
              initial={hostedConfig}
              managedByItmano={pageManaged}
              isSuperAdmin={ctx.role === 'super_admin'}
              canEdit={ctx.role !== 'agent'}
              tenantName={tenantName}
              agentName={channel.agentName}
            />
          ) : (
            <div style={{ background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', padding: '40px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
              Este tipo de canal no usa una página propia.
            </div>
          )
        }
      />
    </>
  )
}
