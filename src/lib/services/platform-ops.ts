import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlatformOpsInput } from '@/lib/data/platform-ops'
import { buildOpsModel, type OpsModel } from '@/lib/ops/model'
import { buildAlerts, type AlertCandidate } from '@/lib/ops/alerts'
import { sendTelegramMessage } from '@/lib/services/telegram'
import { superAdminChatIds } from '@/lib/services/platform-requests'

// La pasada diaria del panel de operación (cron /api/cron/platform-ops):
//   1. foto de métricas en platform_metrics (tendencia, no sólo el hoy),
//   2. alertas nuevas por Telegram a los super_admin (deduplicadas),
//   3. purga de lo que tiene más de RETENTION_DAYS.
// Cada paso corre aislado: uno que falla no impide los otros.

const RETENTION_DAYS = 400
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'

export interface PlatformOpsReport {
  metrics:  number
  alerts:   { candidates: number; new: number; delivered: boolean | null }
  purged:   boolean
  errors:   string[]
}

export function snapshotRows(model: OpsModel) {
  const rows: {
    provider: string; metric: string; account: string | null; tenant_id: string | null
    value: number; limit_value: number | null; unit: string
  }[] = []
  for (const p of model.providers) {
    for (const g of p.gauges) {
      rows.push({ provider: g.provider, metric: g.id, account: g.account ?? null, tenant_id: null, value: g.value, limit_value: g.limit, unit: g.unit })
    }
  }
  for (const t of model.tenants) {
    for (const g of t.gauges) {
      rows.push({ provider: 'tenant', metric: g.id, account: null, tenant_id: t.id, value: g.value, limit_value: g.limit, unit: g.unit })
    }
    rows.push({ provider: 'tenant', metric: 'storage_bytes', account: null, tenant_id: t.id, value: t.storageBytes, limit_value: null, unit: 'bytes' })
  }
  return rows
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function alertsTelegramText(alerts: Pick<AlertCandidate, 'severity' | 'message'>[]): string {
  const critical = alerts.filter(a => a.severity === 'critical')
  const warn = alerts.filter(a => a.severity === 'warn')
  const lines = ['<b>Operación ITMANO</b>']
  if (critical.length) lines.push('', '<b>Urgente</b>', ...critical.map(a => `• ${esc(a.message)}`))
  if (warn.length) lines.push('', '<b>Atención</b>', ...warn.map(a => `• ${esc(a.message)}`))
  lines.push('', `${APP_URL}/admin/operacion`)
  return lines.join('\n')
}

export async function runPlatformOps(now: Date = new Date()): Promise<PlatformOpsReport> {
  const db = createAdminClient()
  const report: PlatformOpsReport = { metrics: 0, alerts: { candidates: 0, new: 0, delivered: null }, purged: false, errors: [] }

  const model = buildOpsModel(await getPlatformOpsInput(), now)

  // 1. Foto.
  try {
    const rows = snapshotRows(model)
    const { error } = await db.from('platform_metrics').insert(rows)
    if (error) throw error
    report.metrics = rows.length
  } catch (err) {
    report.errors.push(`snapshot: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 2. Alertas: sólo las que no existían para su periodo se envían.
  try {
    const candidates = buildAlerts(model, now)
    report.alerts.candidates = candidates.length
    if (candidates.length > 0) {
      const { data: inserted, error } = await db
        .from('platform_alerts')
        .upsert(
          candidates.map(c => ({ alert_key: c.key, period: c.period, severity: c.severity, message: c.message })),
          { onConflict: 'alert_key,period', ignoreDuplicates: true },
        )
        .select('id, severity, message')
      if (error) throw error
      const fresh = inserted ?? []
      report.alerts.new = fresh.length

      if (fresh.length > 0) {
        const chatIds = await superAdminChatIds(db)
        if (chatIds.length === 0) {
          report.errors.push('alerts: ningún super_admin tiene telegram_chat_id')
          report.alerts.delivered = false
        } else {
          const text = alertsTelegramText(fresh as Pick<AlertCandidate, 'severity' | 'message'>[])
          const results = await Promise.all(chatIds.map(id => sendTelegramMessage(id, text)))
          const delivered = results.some(r => r.ok)
          report.alerts.delivered = delivered
          if (delivered) {
            await db.from('platform_alerts').update({ delivered: true }).in('id', fresh.map(f => f.id))
          }
        }
      }
    }
  } catch (err) {
    report.errors.push(`alerts: ${err instanceof Error ? err.message : String(err)}`)
  }

  // 3. Purga.
  try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString()
    const [m, a] = await Promise.all([
      db.from('platform_metrics').delete().lt('captured_at', cutoff),
      db.from('platform_alerts').delete().lt('sent_at', cutoff),
    ])
    if (m.error) throw m.error
    if (a.error) throw a.error
    report.purged = true
  } catch (err) {
    report.errors.push(`purge: ${err instanceof Error ? err.message : String(err)}`)
  }

  return report
}
