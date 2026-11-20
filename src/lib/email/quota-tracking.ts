import type { Resend } from 'resend'
import { SIMULATED_ID_PREFIX } from '@/lib/email/send-guard'
import { parseQuotaHeaders, quotaErrorKind, type QuotaKind } from '@/lib/email/quota'

// Registra la cuota de cada llamada a Resend: cuántos correos aceptó, lo que
// dicen las cabeceras de cuota y si respondió 429 de cuota. Se instala sobre la
// instancia del cliente (src/lib/resend.ts), igual que el guard de envíos, para
// que ningún camino de envío nuevo pueda saltárselo.
//
// Va POR FUERA del guard: un envío simulado fuera de producción no llega a
// Resend, trae un id `simulated_…` y no cuenta.

export interface QuotaObservation {
  account:     string
  sent:        number
  dailyUsed:   number | null
  monthlyUsed: number | null
  exhausted:   QuotaKind | null
}

export type QuotaRecorder = (obs: QuotaObservation) => Promise<void>

type SendResult = {
  data?: unknown
  error?: { name?: string | null; message?: string | null } | null
  headers?: Record<string, string> | null
} | null | undefined

const isReal = (id: unknown): boolean => typeof id === 'string' && id.length > 0 && !id.startsWith(SIMULATED_ID_PREFIX)

/** Correos que Resend aceptó de verdad en una respuesta de emails.send o batch.send. */
export function acceptedCount(kind: 'single' | 'batch', res: SendResult): number {
  if (!res || res.error) return 0
  const data = res.data as { id?: unknown; data?: { id?: unknown }[] } | null | undefined
  if (kind === 'single') return isReal(data?.id) ? 1 : 0
  return (data?.data ?? []).filter(d => isReal(d?.id)).length
}

/** La observación de una respuesta, o null si no aporta nada que guardar. */
export function observe(account: string, kind: 'single' | 'batch', res: SendResult): QuotaObservation | null {
  const sent = acceptedCount(kind, res)
  const { daily, monthly } = parseQuotaHeaders(res?.headers)
  const exhausted = quotaErrorKind(res?.error ?? null)
  if (sent === 0 && daily === null && monthly === null && exhausted === null) return null
  return { account, sent, dailyUsed: daily, monthlyUsed: monthly, exhausted }
}

export function installQuotaTracking(client: Resend, account: string, record: QuotaRecorder): void {
  const track = async (kind: 'single' | 'batch', res: SendResult) => {
    const obs = observe(account, kind, res)
    if (!obs) return
    // Registrar nunca rompe un envío que ya salió.
    try {
      await record(obs)
    } catch (err) {
      console.error(JSON.stringify({ service: 'resend', error: 'quota_record_failed', account, detail: err instanceof Error ? err.message : String(err) }))
    }
  }

  const send = client.emails.send.bind(client.emails)
  client.emails.send = (async (...args: Parameters<typeof send>) => {
    const res = await send(...args)
    await track('single', res as SendResult)
    return res
  }) as typeof client.emails.send

  const batchSend = client.batch.send.bind(client.batch)
  client.batch.send = (async (...args: Parameters<typeof batchSend>) => {
    const res = await batchSend(...args)
    await track('batch', res as SendResult)
    return res
  }) as typeof client.batch.send
}
