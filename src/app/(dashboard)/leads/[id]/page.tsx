import { createAdminClient } from '@/lib/supabase/admin'
import {
  mapAgent,
  mapLead,
  mapLeadEvent,
  mapPurchaseProcess,
  type AgentRow,
  type LeadRow,
  type LeadEventRow,
  type PurchaseProcessRow,
} from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import type { AiFitBriefing } from './ai-fit-card'
import { notFound } from 'next/navigation'
import type { PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor, isRowVisible } from '@/lib/auth/visibility'
import { assertCanWriteLead } from '@/lib/auth/guards'
import { getSubmissionsForLead } from '@/lib/data/form-submissions'
import { getLeadStatusHistory } from '@/lib/data/lead-status-history'
import { getLeadEmailReplies } from '@/lib/data/lead-email-replies'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { getLeadPriorityAxes, getLeadPriorityPositionFor } from '@/lib/data/leads'
import { resolveActorNames, authorOf } from '@/lib/data/activity-authors'
import { buildScoreBreakdown } from '@/lib/scoring/score-breakdown'
import { opportunitiesFor } from '@/lib/scoring/opportunities'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { getTagIdsWithSequence, getTagsForLead, listLeadTags } from '@/lib/data/lead-tags'
import { expectedCommission } from '@/lib/business/profile'
import type { ManualActionItem } from './manual-actions-panel'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  const scope = scopeFor(ctx)
  const supabase = createAdminClient()

  // Todo lo que cuelga del lead sólo necesita su id (viene en la URL) y el
  // tenant del contexto, no la fila del lead: así la fila y el resto viajan en
  // UNA ola. La visibilidad se sigue comprobando sobre la fila antes de
  // devolver nada — un agente (o un tenant ajeno) que llega por URL a un lead
  // que no le toca recibe 404, y lo leído para ese request se descarta sin
  // salir del servidor. Cada lectura va además acotada por tenant_id.
  //
  // requireTenantContext garantiza tenant; si no lo hubiera (super_admin en
  // hub, hoy inalcanzable aquí) la fila del lead se lee primero para saberlo.
  let leadTenantId = tenant_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let preLead: any = null
  if (!leadTenantId) {
    const { data } = await supabase.from('leads').select('*').eq('id', id).single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!isRowVisible(scope, data as any)) notFound()
    preLead = data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leadTenantId = (data as any).tenant_id as string
  }

  // Profile activity feed: an 'agent' only sees system + their own events.
  let eventsQ = supabase.from('lead_events').select('*').eq('lead_id', id).eq('tenant_id', leadTenantId).order('created_at', { ascending: false })
  if (role === 'agent') eventsQ = eventsQ.or(`actor_user_id.is.null,actor_user_id.eq.${user_id}`)

  const [
    { data: rawLead },
    { data: rawAgents },
    { data: rawEvents },
    { data: rawProcess },
    { data: rawChannels },
    submissions,
    scoreRules,
    statusHistory,
    emailReplies,
    { data: tenantRow },
    tenantAccess,
    priorityAxes,
    businessProfile,
    leadTags,
    tagCatalog,
    emailTagIds,
  ] = await Promise.all([
    preLead
      ? Promise.resolve({ data: preLead })
      : supabase.from('leads').select('*').eq('id', id).eq('tenant_id', leadTenantId).single(),
    supabase.from('agents').select('*').eq('tenant_id', leadTenantId),
    eventsQ,
    supabase.from('purchase_processes').select('*').eq('lead_id', id).eq('tenant_id', leadTenantId).maybeSingle(),
    supabase.from('acquisition_channels').select('id, tenant_id, channel_type, name, slug, agent_id').eq('tenant_id', leadTenantId).eq('active', true).order('name'),
    getSubmissionsForLead(id, leadTenantId),
    getGlobalScoreRules(),
    getLeadStatusHistory(id, leadTenantId),
    getLeadEmailReplies(id, leadTenantId),
    // Identidad de envío + flag de análisis con IA salen de la MISMA fila de
    // `tenants`; eran dos queries separadas a la misma fila.
    supabase
      .from('tenants')
      .select('name, slug, email_from_address, resend_account, domain_status, sending_domain, ai_lead_scoring_enabled')
      .eq('id', leadTenantId)
      .maybeSingle(),
    getTenantAccessFor(leadTenantId),
    // Los tres ejes ahora; la posicion en la cola (dos counts sobre indice) en
    // la ola siguiente, junto con los autores de los eventos.
    getLeadPriorityAxes(id, scope),
    // Comisión y moneda de la agencia — sin esto el monto del lead es un número
    // sin significado para quien lo mira.
    getBusinessProfile(leadTenantId),
    // Etiquetas (116): las del lead y el catálogo del tenant para el
    // desplegable.
    getTagsForLead(id),
    listLeadTags(leadTenantId),
    getTagIdsWithSequence(leadTenantId),
  ])

  // La comprobación de visibilidad va ANTES de usar cualquier otra lectura.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isRowVisible(scope, rawLead as any)) notFound()

  // Segunda ola: lo único que depende de la primera. El ranking usa los ejes
  // recién leídos y los autores salen de los eventos.
  const [priority, actorNames] = await Promise.all([
    getLeadPriorityPositionFor(priorityAxes, scope),
    resolveActorNames((rawEvents ?? []).map(r => (r as LeadEventRow).actor_user_id ?? null)),
  ])

  // Manual agent actions = active manual scoring rules (driven by Settings → Scoring).
  const manualActions: ManualActionItem[] = scoreRules
    .filter(r => r.category === 'manual' && r.isActive)
    .sort((a, b) => b.points - a.points)
    .map(r => ({
      dimension:    r.dimension,
      label:        r.label ?? r.dimension,
      points:       r.points,
      isDisqualify: r.sideEffect === 'force_perdido',
    }))

  const lead           = mapLead(rawLead as LeadRow)
  // Quién puede etiquetar = quién puede escribir el lead. Se calcula con el
  // MISMO guard que la acción (assertCanWriteLead) en vez de deducirlo del rol:
  // así el botón y el permiso real no pueden separarse.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canTag         = assertCanWriteLead(ctx, rawLead as any) === null
  const agents         = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  // Event authors were resolved in one batch above (no N+1); attach the label.
  const events         = (rawEvents  ?? []).map(r => {
    const e = mapLeadEvent(r as LeadEventRow)
    return { ...e, author: authorOf(e.actorUserId ?? null, actorNames) }
  })

  // Score breakdown (calculated view): fit dimensions matched to their rules.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lr = rawLead as any
  const scoreBreakdown = buildScoreBreakdown({
    fitProfile:      (lr.fit_profile as Record<string, unknown> | null) ?? null,
    fitScore:        (lr.fit_score as number | null) ?? 0,
    engagementScore: (lr.engagement_score as number | null) ?? 0,
    manualScore:     (lr.manual_score as number | null) ?? 0,
    currentScore:    (lr.current_score as number | null) ?? 0,
    rules:           scoreRules,
  })
  const opportunities = opportunitiesFor(lr.fit_profile as Record<string, unknown> | null)

  // Valor potencial: lo que deja la operación si cierra. El bucket de presupuesto
  // dice en qué rango cae el lead; esto dice cuánto vale — dos leads igual de
  // buenos no valen lo mismo si uno compra el doble. Es un HECHO condicional
  // ("si cierra, deja X"), no una probabilidad: no se pondera por calidad ni se
  // mezcla con el score.
  const budgetAmount = typeof lr.metadata?.budget_amount === 'number' ? lr.metadata.budget_amount as number : null
  // La comisión es una sola, la de la agencia (migración 094). Hubo una por
  // agente y se retiró: lo que cada agente negocia es su split de esta cifra, y
  // un split no cambia el orden de su propia cartera. La tarjeta dice de quién
  // es el número en vez de dejar que se lea como el neto del agente.
  const potentialValue = budgetAmount === null ? null : {
    amount:     budgetAmount,
    commission: expectedCommission(budgetAmount, businessProfile, lr.metadata?.intent === 'sell' ? 'sell' : 'buy'),
    currency:   businessProfile.currency,
  }
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null

  // Identidad de envío del tenant (065) — el popup de correo muestra desde qué
  // dirección sale el corporativo y avisa si el dominio propio aún no está
  // verificado (mientras tanto sale por el dominio de ITMANO).
  // El badge necesita el acceso de facturación (customDomainAllowed) igual que
  // los puntos de envío reales: si la suscripción está degradada (paused/cancelled),
  // el envío ya sale por el dominio compartido y el badge no puede seguir
  // mostrando el dominio propio del tenant — le mentiría al usuario justo
  // cuando más necesita saber la verdad.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tRow = tenantRow as any
  const identity = tRow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? resolveSenderIdentity(tRow as any, { customDomainAllowed: tenantAccess.customDomainAllowed })
    : null
  const emailSending = {
    from:          identity?.from ?? null,
    sendingDomain: (tRow?.sending_domain as string | null) ?? null,
    domainStatus:  (tRow?.domain_status as string | null) ?? 'not_configured',
    // true cuando el correo corporativo sale por el dominio compartido de ITMANO.
    usingSharedDomain: !!identity?.from?.includes('@mail.itmano.com'),
  }

  // Estado del análisis de fit con IA (064) — se muestra en el detalle del lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiFitMeta = ((lr.metadata as any)?.ai_fit ?? null) as {
    read?: string; next_action?: string; next_action_when?: string
    talking_points?: unknown; watch_out?: string; at?: string; reasoning?: string
  } | null
  // Briefing estructurado; compat con análisis viejos que solo tenían `reasoning`.
  const rawWhen = aiFitMeta?.next_action_when
  const nextWhen: 'hoy' | 'esta_semana' | 'sin_apuro' | null =
    rawWhen === 'hoy' || rawWhen === 'esta_semana' || rawWhen === 'sin_apuro' ? rawWhen : null
  const briefing: AiFitBriefing | null = aiFitMeta && (aiFitMeta.read || aiFitMeta.next_action || aiFitMeta.reasoning)
    ? {
        read:          aiFitMeta.read ?? aiFitMeta.reasoning ?? '',
        nextAction:    aiFitMeta.next_action ?? '',
        when:          nextWhen,
        talkingPoints: Array.isArray(aiFitMeta.talking_points) ? aiFitMeta.talking_points.filter((t): t is string => typeof t === 'string') : [],
        watchOut:      aiFitMeta.watch_out ?? '',
      }
    : null
  const aiFit = {
    enabled:  (tRow?.ai_lead_scoring_enabled as boolean) ?? false,
    briefing,
    at:       aiFitMeta?.at ?? null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
    agentId:     (r.agent_id ?? null) as string | null,
    active:      true,  // la query ya filtra active = true
  }))
  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      agents={agents}
      channels={channels}
      purchaseProcess={purchaseProcess}
      events={events}
      submissions={submissions}
      emailReplies={emailReplies}
      manualActions={manualActions}
      statusHistory={statusHistory}
      scoreBreakdown={scoreBreakdown}
      opportunities={opportunities}
      priority={priority}
      potentialValue={potentialValue}
      emailSending={emailSending}
      aiFit={aiFit}
      tags={leadTags}
      tagCatalog={tagCatalog}
      canTag={canTag}
      emailTagIds={emailTagIds}
    />
  )
}
