import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { getBroadcast, getBroadcastIssues, getBroadcastMetrics } from '@/lib/data/email-broadcasts'
import { listLeadTags } from '@/lib/data/lead-tags'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { PageHeader } from '@/components/ui/page-header'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { BroadcastEditor } from './broadcast-editor'
import { BroadcastProgress } from './broadcast-progress'

// Un correo grupal. En borrador se edita; confirmado, se sigue su avance. Todo
// depende de la sesión y de datos que cambian durante el envío, así que no hay
// nada que sacar al shell estático ni que cachear con `use cache`.

const AGENT_COLUMNS   = columns('agents', ['id', 'name'])
const CHANNEL_COLUMNS = columns('acquisition_channels', ['id', 'name'])
const TENANT_COLUMNS  = columns('tenants', ['postal_address'])

/* eslint-disable @typescript-eslint/no-explicit-any */

async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireTenantContext()
  const scope = scopeFor(ctx)
  const tenantId = ctx.tenant_id
  if (!tenantId) notFound()

  const broadcast = await getBroadcast(id, scope)
  if (!broadcast) notFound()

  const back = (
    <Link href="/emails?tab=grupales" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '12px' }}>
      <ArrowLeft size={13} /> Correos grupales
    </Link>
  )

  if (broadcast.status !== 'draft') {
    const [metrics, issues] = await Promise.all([
      getBroadcastMetrics(tenantId, broadcast.id),
      getBroadcastIssues(tenantId, broadcast.id),
    ])
    return (
      <>
        {back}
        <PageHeader title={broadcast.name} description="Correo grupal" />
        <BroadcastProgress broadcast={broadcast} metrics={metrics} issues={issues} />
      </>
    )
  }

  const db = createAdminClient()
  let agentsQ = db.from('agents').select(AGENT_COLUMNS).eq('tenant_id', tenantId).eq('active', true).order('name')
  if (scope.agentId) agentsQ = agentsQ.eq('id', scope.agentId)
  let channelsQ = db.from('acquisition_channels').select(CHANNEL_COLUMNS).eq('tenant_id', tenantId).order('name')
  if (scope.agentId) channelsQ = channelsQ.eq('agent_id', scope.agentId)

  const [tags, { data: agents }, { data: channels }, { data: tenant }] = await Promise.all([
    listLeadTags(tenantId),
    agentsQ,
    channelsQ,
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
  ])

  return (
    <>
      {back}
      <PageHeader title="Correo grupal" description="Elige a quién le llega, escríbelo y revísalo antes de enviar." />
      <BroadcastEditor
        broadcast={broadcast}
        tags={tags.map(t => ({ id: t.id, name: t.name }))}
        agents={((agents ?? []) as any[]).map(a => ({ id: a.id as string, name: a.name as string }))}
        channels={((channels ?? []) as any[]).map(c => ({ id: c.id as string, name: c.name as string }))}
        postalAddress={((tenant as any)?.postal_address as string | null) ?? ''}
        canEditPostalAddress={ctx.role !== 'agent'}
        restrictedToOwnLeads={!!scope.agentId}
      />
    </>
  )
}

export default freshOnNavigation(BroadcastPage)
