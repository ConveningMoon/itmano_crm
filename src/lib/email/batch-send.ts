import { createHash } from 'crypto'
import type { Resend } from 'resend'

// Envío por lotes a Resend que comparten los despachadores masivos (open houses
// y correos grupales). Aquí vive lo que un error convertiría en correos
// duplicados o perdidos: la clave de idempotencia, el 429 y el emparejamiento
// de la respuesta permisiva.

/** La API batch de Resend acepta 100 correos por llamada. */
export const BATCH_SIZE = 100

// Resend limita requests por segundo por cuenta; una pausa corta entre
// llamadas evita el 429 sin alargar de verdad un envío de cientos.
export const PAUSE_BETWEEN_CALLS_MS = 600

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function isRateLimit(err: { message?: string; name?: string; statusCode?: number | null } | null | undefined): boolean {
  if (!err) return false
  return err.statusCode === 429 || /rate.?limit|too many/i.test(`${err.name ?? ''} ${err.message ?? ''}`)
}

/**
 * Derivada de los leads del lote: si Resend aceptó un lote y el proceso murió
 * antes de anotarlo, el reintento recibe los mismos ids en vez de mandar otra vez.
 */
export function batchIdempotencyKey(prefix: string, leadIds: string[]): string {
  const h = createHash('sha256').update([...leadIds].sort().join(',')).digest('hex').slice(0, 32)
  return `${prefix}/${h}`
}

export interface BatchItem<P> {
  leadId:  string
  payload: P
}

export interface BatchResult<P> {
  rateLimited: boolean
  sent:        { item: BatchItem<P>; id: string }[]
  failed:      { leadId: string; error: string }[]
}

type BatchClient = Pick<Resend, 'batch'>

export async function sendPermissiveBatch<P>(
  client: BatchClient,
  items: BatchItem<P>[],
  idempotencyKey: string,
): Promise<BatchResult<P>> {
  const out: BatchResult<P> = { rateLimited: false, sent: [], failed: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.batch.send(items.map(i => i.payload) as any, { idempotencyKey, batchValidation: 'permissive' })
  if (res.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (isRateLimit(res.error as any)) out.rateLimited = true
    else items.forEach(i => out.failed.push({ leadId: i.leadId, error: res.error!.message }))
    return out
  }
  const ids = res.data?.data ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const errors = new Map<number, string>(((res.data as any)?.errors ?? []).map((e: any) => [e.index, e.message]))
  // En modo permisivo `data` trae sólo los aceptados, en orden: se emparejan
  // saltando los índices que fallaron.
  let cursor = 0
  items.forEach((item, i) => {
    if (errors.has(i)) { out.failed.push({ leadId: item.leadId, error: errors.get(i)! }); return }
    const id = ids[cursor++]?.id
    if (id) out.sent.push({ item, id })
    else out.failed.push({ leadId: item.leadId, error: 'Resend no devolvió id' })
  })
  return out
}
