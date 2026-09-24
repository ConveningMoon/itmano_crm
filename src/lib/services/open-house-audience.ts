import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chunk, matchesAudience, type AudienceLead } from '@/lib/open-houses/audience'
import type { AudienceMatch } from '@/lib/open-houses/model'

// Lecturas de audiencia de un open house. Todas filtran por tenant en código
// además de por ids: corren con el admin client.
//
// PostgREST corta en 1000 filas por respuesta, y un tenant puede tener más
// leads etiquetados que eso. Por eso las lecturas paginan con `range` en vez de
// confiar en que un solo select lo trae todo.

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = 1000
// Una lista de ids viaja en la URL de `.in()`; 200 uuids caben holgados.
const IDS_PER_QUERY = 200

async function pageAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** Ids de los leads del tenant que entran en la audiencia por etiquetas. */
export async function audienceLeadIdsByTags(
  db: SupabaseClient,
  tenantId: string,
  tagIds: string[],
  match: AudienceMatch,
): Promise<string[]> {
  if (tagIds.length === 0) return []
  const rows = await pageAll<{ lead_id: string; tag_id: string }>((from, to) =>
    db.from('lead_tag_assignments')
      .select('lead_id, tag_id')
      .eq('tenant_id', tenantId)
      .in('tag_id', tagIds)
      .order('lead_id')
      .range(from, to) as any,
  )
  const byLead = new Map<string, string[]>()
  for (const r of rows) {
    const list = byLead.get(r.lead_id) ?? []
    list.push(r.tag_id)
    byLead.set(r.lead_id, list)
  }
  return [...byLead.entries()]
    .filter(([, tags]) => matchesAudience(tags, tagIds, match))
    .map(([leadId]) => leadId)
}

export interface AudienceLeadWithContact extends AudienceLead {
  firstName:      string
  agentId:        string | null
  agentName:      string
  agentEmail:     string
  agentSignature: string | null
}

/** Datos de envío de una lista de leads del tenant (email, idioma, agente). */
export async function loadAudienceLeads(
  db: SupabaseClient,
  tenantId: string,
  leadIds: string[],
): Promise<AudienceLeadWithContact[]> {
  const out: AudienceLeadWithContact[] = []
  for (const ids of chunk([...new Set(leadIds)], IDS_PER_QUERY)) {
    const { data, error } = await db
      .from('leads')
      .select('id, first_name, email, language, email_blocked, agents (id, name, email, email_signature, language, languages)')
      .eq('tenant_id', tenantId)
      .in('id', ids)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as any[]) {
      const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents
      out.push({
        id:             row.id as string,
        email:          (row.email as string | null) ?? null,
        emailBlocked:   row.email_blocked === true,
        language:       (row.language as string | null) ?? null,
        agentLanguages: (agent?.languages as string[] | null) ?? null,
        agentPrimary:   (agent?.language as string | undefined) ?? 'es',
        tagIds:         [],
        firstName:      (row.first_name as string | null) ?? '',
        agentId:        (agent?.id as string | null) ?? null,
        agentName:      (agent?.name as string | null) ?? '',
        agentEmail:     (agent?.email as string | null) ?? '',
        agentSignature: (agent?.email_signature as string | null) ?? null,
      })
    }
  }
  return out
}

/** Leads que respondieron el RSVP (opcionalmente sólo con una respuesta). */
export async function rsvpLeadIds(
  db: SupabaseClient,
  tenantId: string,
  openHouseId: string,
  response?: 'yes' | 'no',
): Promise<string[]> {
  const rows = await pageAll<{ lead_id: string }>((from, to) => {
    let q = db.from('open_house_rsvps')
      .select('lead_id')
      .eq('tenant_id', tenantId)
      .eq('open_house_id', openHouseId)
    if (response) q = q.eq('response', response)
    return q.order('lead_id').range(from, to) as any
  })
  return rows.map(r => r.lead_id)
}

/** Leads a los que el anuncio de este open house les llegó. */
export async function announcementRecipientIds(
  db: SupabaseClient,
  tenantId: string,
  openHouseId: string,
): Promise<string[]> {
  const { data: announcement } = await db
    .from('open_house_emails')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('open_house_id', openHouseId)
    .eq('kind', 'announcement')
    .maybeSingle()
  if (!announcement) return []
  const rows = await pageAll<{ lead_id: string }>((from, to) =>
    db.from('open_house_email_recipients')
      .select('lead_id')
      .eq('tenant_id', tenantId)
      .eq('email_id', (announcement as any).id)
      .eq('status', 'sent')
      .order('lead_id')
      .range(from, to) as any,
  )
  return rows.map(r => r.lead_id)
}
