import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { diagnoseSource, type SourceHealth, type SubmissionAnswer } from '@/lib/sources/health'

// Diagnóstico por fuente, calculado del tráfico real (`form_submissions`).
//
// Una sola consulta para todo el tenant: son pocos envíos por canal y la
// alternativa (una por canal) multiplicaría los viajes en una pantalla que ya
// carga métricas.

/** Envíos por canal que se miran. Suficiente para ver el patrón, no todo el histórico. */
const MAX_SUBMISSIONS = 500

export async function getSourcesHealth(tenantId: string): Promise<Record<string, SourceHealth>> {
  const db = createAdminClient()
  const [{ data, error }, { data: viewRows }, profile] = await Promise.all([
    db.from('form_submissions')
      .select('channel_id, answers')
      .eq('tenant_id', tenantId)
      .order('submitted_at', { ascending: false })
      .limit(MAX_SUBMISSIONS),
    // Las visitas dicen si la página tiene el script de medición. Se cuentan
    // sobre TODO el histórico, no sobre una ventana: la pregunta no es "cuántas
    // visitas tuvo este mes" sino "¿alguna vez ha reportado una?".
    db.from('channel_page_views').select('channel_id').eq('tenant_id', tenantId).limit(5000),
    getBusinessProfile(tenantId),
  ])

  if (error) {
    console.error(JSON.stringify({ service: 'sources-health', error: error.message }))
    return {}
  }

  const porCanal = new Map<string, Array<{ answers: SubmissionAnswer[] }>>()
  for (const row of (data ?? []) as { channel_id: string; answers: unknown }[]) {
    if (!row.channel_id) continue
    const lista = porCanal.get(row.channel_id) ?? []
    lista.push({ answers: Array.isArray(row.answers) ? (row.answers as SubmissionAnswer[]) : [] })
    porCanal.set(row.channel_id, lista)
  }

  const vistasPorCanal = new Map<string, number>()
  for (const v of (viewRows ?? []) as { channel_id: string }[]) {
    vistasPorCanal.set(v.channel_id, (vistasPorCanal.get(v.channel_id) ?? 0) + 1)
  }

  const out: Record<string, SourceHealth> = {}
  for (const [channelId, envios] of porCanal) {
    out[channelId] = diagnoseSource(envios, profile, vistasPorCanal.get(channelId) ?? 0)
  }
  return out
}
