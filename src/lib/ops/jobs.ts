// Registro de los procesos que corren solos (crons y webhooks) y cada cuánto
// deben dar señales de vida. Puro: lo importan el panel, las alertas y los tests.
//
// `everyMinutes` es la cadencia esperada. Un latido se considera viejo cuando
// pasaron más de STALE_FACTOR × esa cadencia, para no alarmar por un minuto de
// retraso de Vercel Cron o de cron-job.org. Los webhooks no tienen cadencia
// (dependen de que haya correos o pagos): sólo informan cuándo llegó el último.

export type OpsJobId =
  | 'cron:score-decay'
  | 'cron:sequence-orchestrator'
  | 'cron:billing-lifecycle'
  | 'cron:platform-ops'
  | 'cron:warm'
  | 'webhook:resend'
  | 'webhook:paddle'

export interface OpsJobDef {
  label:        string
  /** Quién lo dispara, para saber dónde mirar si se para. */
  trigger:      string
  everyMinutes: number | null
}

export const OPS_JOBS: Record<OpsJobId, OpsJobDef> = {
  'cron:score-decay':           { label: 'Decay del score y bandas de calidad', trigger: 'Vercel Cron (diario)', everyMinutes: 24 * 60 },
  'cron:sequence-orchestrator': { label: 'Orquestador de secuencias y envíos programados', trigger: 'cron-job.org (cada hora)', everyMinutes: 60 },
  'cron:billing-lifecycle':     { label: 'Ciclo de facturación (gracias y retención)', trigger: 'cron-job.org (diario)', everyMinutes: 24 * 60 },
  'cron:platform-ops':          { label: 'Métricas y alertas de plataforma', trigger: 'Vercel Cron (diario)', everyMinutes: 24 * 60 },
  'cron:warm':                  { label: 'Calentar la base', trigger: 'Vercel Cron (cada minuto)', everyMinutes: 1 },
  'webhook:resend':             { label: 'Eventos de Resend (entregas, rebotes, respuestas)', trigger: 'Webhook de Resend', everyMinutes: null },
  'webhook:paddle':             { label: 'Eventos de Paddle (pagos)', trigger: 'Webhook de Paddle', everyMinutes: null },
}

export const OPS_JOB_IDS = Object.keys(OPS_JOBS) as OpsJobId[]

/** Un latido es viejo pasado este múltiplo de su cadencia (mínimo 10 minutos). */
export const STALE_FACTOR = 2
const MIN_GRACE_MS = 10 * 60_000

export function staleAfterMs(job: OpsJobId): number | null {
  const every = OPS_JOBS[job].everyMinutes
  if (every === null) return null
  return Math.max(every * 60_000 * STALE_FACTOR, MIN_GRACE_MS)
}
