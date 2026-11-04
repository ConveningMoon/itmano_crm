import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { parseBroadcastAudience, type BroadcastAudience } from '@/lib/broadcasts/audience'
import type { BroadcastStatus } from '@/lib/broadcasts/model'
import type { VisibilityScope } from '@/lib/auth/visibility'

// Lecturas de correos grupales. Corren con el admin client: el tenant y el
// alcance del agente van siempre en la consulta. Un agente ve sólo los envíos
// a sus leads (`scope_agent_id`); owner y super_admin, todos los del tenant.

/* eslint-disable @typescript-eslint/no-explicit-any */

const LIST_COLUMNS = columns('email_broadcasts', [
  'id', 'tenant_id', 'name', 'status', 'scheduled_at', 'sent_count', 'skipped_count', 'failed_count',
  'finished_at', 'created_at', 'last_error',
])
const DETAIL_COLUMNS = columns('email_broadcasts', [
  'id', 'tenant_id', 'name', 'status', 'audience', 'languages', 'sender_agent_id', 'scope_agent_id',
  'scheduled_at', 'sent_count', 'skipped_count', 'failed_count', 'started_at', 'finished_at', 'last_error',
  'guard_overridden_at', 'recipients_frozen_at',
])
const CONTENT_COLUMNS = columns('email_broadcast_contents', ['language', 'subject', 'body_json'])

export interface BroadcastListItem {
  id:           string
  name:         string
  status:       BroadcastStatus
  scheduledAt:  string | null
  sentCount:    number
  skippedCount: number
  failedCount:  number
  finishedAt:   string | null
  createdAt:    string
  lastError:    string | null
}

export async function listBroadcasts(scope: VisibilityScope): Promise<BroadcastListItem[]> {
  if (!scope.tenantId) return []
  let q = createAdminClient()
    .from('email_broadcasts')
    .select(LIST_COLUMNS)
    .eq('tenant_id', scope.tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (scope.agentId) q = q.eq('scope_agent_id', scope.agentId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(r => ({
    id:           r.id,
    name:         r.name,
    status:       r.status,
    scheduledAt:  r.scheduled_at ?? null,
    sentCount:    r.sent_count,
    skippedCount: r.skipped_count,
    failedCount:  r.failed_count,
    finishedAt:   r.finished_at ?? null,
    createdAt:    r.created_at,
    lastError:    r.last_error ?? null,
  }))
}

export interface BroadcastContent {
  language: string
  subject:  string
  bodyJson: unknown
}

export interface BroadcastDetail {
  id:            string
  tenantId:      string
  name:          string
  status:        BroadcastStatus
  audience:      BroadcastAudience
  languages:     string[]
  senderAgentId: string | null
  scopeAgentId:  string | null
  scheduledAt:   string | null
  sentCount:     number
  skippedCount:  number
  failedCount:   number
  startedAt:     string | null
  finishedAt:    string | null
  lastError:     string | null
  contents:      BroadcastContent[]
}

export async function getBroadcast(id: string, scope: VisibilityScope): Promise<BroadcastDetail | null> {
  if (!scope.tenantId) return null
  const db = createAdminClient()
  let q = db.from('email_broadcasts').select(DETAIL_COLUMNS).eq('id', id).eq('tenant_id', scope.tenantId)
  if (scope.agentId) q = q.eq('scope_agent_id', scope.agentId)
  const [{ data: row, error }, { data: contents }] = await Promise.all([
    q.maybeSingle(),
    db.from('email_broadcast_contents').select(CONTENT_COLUMNS).eq('broadcast_id', id).eq('tenant_id', scope.tenantId),
  ])
  if (error) throw new Error(error.message)
  if (!row) return null
  const r = row as any
  return {
    id:            r.id,
    tenantId:      r.tenant_id,
    name:          r.name,
    status:        r.status,
    audience:      parseBroadcastAudience(r.audience),
    languages:     r.languages,
    senderAgentId: r.sender_agent_id ?? null,
    scopeAgentId:  r.scope_agent_id ?? null,
    scheduledAt:   r.scheduled_at ?? null,
    sentCount:     r.sent_count,
    skippedCount:  r.skipped_count,
    failedCount:   r.failed_count,
    startedAt:     r.started_at ?? null,
    finishedAt:    r.finished_at ?? null,
    lastError:     r.last_error ?? null,
    contents:      ((contents ?? []) as any[]).map(c => ({ language: c.language, subject: c.subject, bodyJson: c.body_json })),
  }
}

export interface BroadcastMetrics {
  leads:        number
  clicked:      number
  replied:      number
  bounced:      number
  complained:   number
  unsubscribed: number
}

export async function getBroadcastMetrics(tenantId: string, id: string): Promise<BroadcastMetrics> {
  const { data, error } = await createAdminClient()
    .rpc('email_broadcast_metrics', { p_tenant_id: tenantId, p_broadcast_ids: [id] })
  if (error) throw new Error(error.message)
  const m = (data as any)?.[id]
  return {
    leads:        m?.leads ?? 0,
    clicked:      m?.clicked ?? 0,
    replied:      m?.replied ?? 0,
    bounced:      m?.bounced ?? 0,
    complained:   m?.complained ?? 0,
    unsubscribed: m?.unsubscribed ?? 0,
  }
}

/** Omitidos por motivo y fallidos con su último error, para explicar el resultado. */
export async function getBroadcastIssues(tenantId: string, id: string): Promise<{
  skipped: Record<string, number>
  failed:  { leadId: string; error: string | null }[]
}> {
  const db = createAdminClient()
  const [{ data: skipped }, { data: failed }] = await Promise.all([
    db.from('email_broadcast_recipients').select('skip_reason')
      .eq('tenant_id', tenantId).eq('broadcast_id', id).eq('status', 'skipped').limit(2000),
    db.from('email_broadcast_recipients').select('lead_id, last_error')
      .eq('tenant_id', tenantId).eq('broadcast_id', id).eq('status', 'failed').limit(20),
  ])
  const byReason: Record<string, number> = {}
  for (const r of (skipped ?? []) as any[]) {
    const k = (r.skip_reason as string | null) ?? 'unknown'
    byReason[k] = (byReason[k] ?? 0) + 1
  }
  return {
    skipped: byReason,
    failed:  ((failed ?? []) as any[]).map(r => ({ leadId: r.lead_id, error: r.last_error ?? null })),
  }
}
