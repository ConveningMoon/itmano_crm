import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Human-readable entry-path label for the feed.
const VIA_LABELS: Record<string, string> = {
  intake:       'formulario',
  contact_form: 'formulario de contacto',
  manual:       'registro manual',
  import:       'importación',
}

// Emits the lifecycle event `lead_created` (points 0 — it is a log entry, NOT a
// scoring rule, so recompute_lead_score ignores it like status_changed). Call ONLY
// when a NEW lead is created (never on the dedup / existing-lead path).
//   - actorUserId = the user who created it (manual / import), or null = system
//     (intake form / contact webhook).
//   - channelLabel = optional entry detail (channel name / slug) for the feed.
// Errors are logged, never thrown — a failed log must not fail lead creation.
export async function emitLeadCreated(
  db: AdminClient,
  args: { leadId: string; tenantId: string; via: string; actorUserId?: string | null; channelLabel?: string | null },
): Promise<void> {
  const base   = VIA_LABELS[args.via] ?? args.via
  const detail = args.channelLabel ? `${base}: ${args.channelLabel}` : base
  const { error } = await db.from('lead_events').insert({
    lead_id:       args.leadId,
    tenant_id:     args.tenantId,
    type:          'lead_created',
    description:   `Lead registrado (${detail})`,
    points:        0,
    actor_user_id: args.actorUserId ?? null,
    metadata:      { source: args.via, ...(args.channelLabel ? { channel: args.channelLabel } : {}) },
  })
  if (error) {
    console.error(JSON.stringify({
      service: 'emit-lead-created', lead_id: args.leadId, error: 'insert_failed', detail: error.message,
    }))
  }
}
