import { z } from 'zod'

// Validador del payload del beacon de vistas de edición, separado en su propio
// archivo para poder probarlo sin levantar el servidor (mismo motivo que
// intake/[publicId]/view no lo tiene: aquí sí conviene, porque la forma del
// payload es mínima y merece un test unitario aislado).

const ViewPayloadSchema = z.object({
  editionId: z.string().uuid(),
  // El fingerprint del visitante es opcional en el schema porque un payload
  // sin él sigue siendo válido como JSON: lo que lo descarta es el guard de
  // `visitor_fingerprint NOT NULL` en el propio handler (ver route.ts).
  visitorId: z.string().min(1).optional(),
})

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Parsea el body `text/plain` (JSON serializado) del beacon y devuelve el
 * `editionId` si es válido, o `null` en cualquier otro caso.
 *
 * Nunca lanza: un beacon no se puede reintentar, así que un payload roto se
 * descarta en silencio en vez de tumbar el request.
 */
export function parseViewPayload(raw: string): string | null {
  const result = ViewPayloadSchema.safeParse(safeParseJson(raw))
  return result.success ? result.data.editionId : null
}

/** Mismo payload, extrae `visitorId` (futuro `visitor_fingerprint`). */
export function parseVisitorId(raw: string): string | null {
  const result = ViewPayloadSchema.safeParse(safeParseJson(raw))
  return result.success ? (result.data.visitorId ?? null) : null
}
