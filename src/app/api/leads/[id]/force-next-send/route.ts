import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params

  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  // Verify the lead belongs to the caller's tenant
  let leadQ = supabase.from('leads').select('id, tenant_id').eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  // Set next_send_at = NOW() for all active runs of this lead
  const { error: updateErr, count } = await supabase
    .from('lead_sequence_runs')
    .update({ next_send_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('status', 'active')

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  if ((count ?? 0) === 0) {
    return NextResponse.json({ error: 'Este lead no tiene runs activos en ninguna secuencia' }, { status: 400 })
  }

  // Call the orchestrator scoped to this lead so only its run(s) are processed
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const orchestratorUrl = `${baseUrl}/api/cron/sequence-orchestrator?lead_id=${encodeURIComponent(leadId)}`

  let orchestratorResult: Record<string, unknown> = {}
  try {
    const res = await fetch(orchestratorUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
    })
    orchestratorResult = (await res.json()) as Record<string, unknown>
  } catch (err) {
    return NextResponse.json({
      error: `Error al llamar al orquestador: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 502 })
  }

  return NextResponse.json({ ok: true, ...orchestratorResult })
}
