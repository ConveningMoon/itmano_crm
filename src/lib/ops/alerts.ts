// Qué alertas genera el modelo de operación. PURO: el envío (Telegram) y la
// deduplicación (`platform_alerts`) viven en src/lib/services/platform-ops.ts.
//
// La clave de una alerta dice QUÉ pasa; el periodo dice CUÁNDO se puede repetir.
// Un correo del mes al 80% avisa una vez ese mes; un cron caído, una vez al día;
// un vencimiento, una vez por umbral (14 y 3 días).

import { formatValue, type Gauge, type OpsModel } from '@/lib/ops/model'

export interface AlertCandidate {
  key:      string
  period:   string
  severity: 'warn' | 'critical'
  message:  string
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}
function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7)
}

function periodFor(g: Gauge, now: Date): string {
  // 'none' (Storage, dominios, leads) se repite una vez al mes como mucho.
  return g.period === 'day' ? dayKey(now) : monthKey(now)
}

function gaugeMessage(scope: string, g: Gauge): string {
  const pct = g.ratio !== null ? ` (${Math.round(g.ratio * 100)}%)` : ''
  const limit = g.limit !== null ? ` de ${formatValue(g.unit, g.limit)}` : ''
  return `${scope} · ${g.label}: ${formatValue(g.unit, g.value)}${limit}${pct}`
}

export function buildAlerts(model: OpsModel, now: Date = new Date()): AlertCandidate[] {
  const out: AlertCandidate[] = []

  const fromGauge = (scopeKey: string, scopeLabel: string, g: Gauge) => {
    if (!g.alertable) return
    if (g.status !== 'warn' && g.status !== 'critical') return
    out.push({
      key:      `${scopeKey}.${g.id}.${g.status}`,
      period:   periodFor(g, now),
      severity: g.status,
      message:  gaugeMessage(scopeLabel, g),
    })
  }

  for (const p of model.providers) for (const g of p.gauges) fromGauge(`provider.${p.key}`, p.label, g)
  for (const t of model.tenants) for (const g of t.gauges) fromGauge(`tenant.${t.id}`, t.name, g)

  for (const h of model.health) {
    // Las alertas las manda este mismo cron: mientras corre no puede estar
    // caído, y si se cae no hay quién avise. Su estado se ve en el panel.
    if (h.job === 'cron:platform-ops') continue
    if (h.status === 'failing') {
      out.push({
        key: `job.${h.job}.failing`, period: dayKey(now), severity: 'critical',
        message: `${h.label} falló${h.consecutiveFailures > 1 ? ` ${h.consecutiveFailures} veces seguidas` : ''}${h.lastError ? `: ${h.lastError}` : ''}`,
      })
    } else if (h.status === 'stale' || h.status === 'never') {
      out.push({
        key: `job.${h.job}.${h.status}`, period: dayKey(now), severity: 'critical',
        message: h.status === 'never'
          ? `${h.label} nunca ha registrado una ejecución (${h.trigger}).`
          : `${h.label} no corre desde hace más de lo esperado (${h.trigger}).`,
      })
    }
  }

  for (const c of model.calendar) {
    if (c.status !== 'warn' && c.status !== 'critical') continue
    const threshold = c.status === 'critical' ? '3d' : '14d'
    out.push({
      key: `calendar.${c.id}.${threshold}`,
      // El periodo es la propia fecha: si la fecha cambia (renovaste), vuelve a avisar.
      period: c.date.slice(0, 10),
      severity: c.status,
      message: c.daysLeft < 0
        ? `${c.label}: vencido hace ${Math.abs(c.daysLeft)} días.`
        : `${c.label}: en ${c.daysLeft} días (${c.date.slice(0, 10)}).`,
    })
  }

  return out
}
