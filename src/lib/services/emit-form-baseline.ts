import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// Emits the one-time form_baseline engagement event (+10) for a lead's FIRST form,
// regardless of channel_type. dedup_key='form_baseline' is lead-scoped, so it fires
// at most once per lead even if more than one entry path calls it. Call ONLY when a
// NEW lead is created (never on the dedup / existing-lead path). The AFTER INSERT
// trigger recomputes the score. Errors are logged, never thrown — a failed baseline
// must not fail the submission.
export async function emitFormBaselineOnce(
  db: AdminClient,
  leadId: string,
  tenantId: string
): Promise<void> {
  const { error } = await db.from('lead_events').insert({
    lead_id:     leadId,
    tenant_id:   tenantId,
    type:        'form_baseline',
    description: 'Formulario enviado',
    points:      10,
    dedup_key:   'form_baseline',
  })
  if (error) {
    console.error(JSON.stringify({
      service: 'emit-form-baseline', lead_id: leadId, error: 'insert_failed', detail: error.message,
    }))
  }
}
