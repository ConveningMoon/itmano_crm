import 'server-only'
import { createHash } from 'node:crypto'
import { ApiError } from './errors'

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100

// Hash estable del conjunto de filtros. Las claves se ordenan para que el orden
// en el query string no genere cursores distintos para la misma consulta, y se
// incrusta en el cursor: presentar un cursor de una consulta contra otra
// distinta daría una página incoherente en vez de un error.
function filterHash(filters: unknown): string {
  const canonical = JSON.stringify(filters, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : value,
  )
  return createHash('sha256').update(canonical ?? 'null').digest('base64url').slice(0, 12)
}

export interface CursorKey {
  created_at: string
  id: string
}

export function encodeCursor(last: CursorKey, filters: unknown): string {
  return Buffer.from(JSON.stringify({
    k: [last.created_at, last.id],
    f: filterHash(filters),
  })).toString('base64url')
}

export function decodeCursor(raw: string, filters: unknown): CursorKey {
  let parsed: { k?: unknown; f?: unknown }

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    throw new ApiError('invalid_arguments', 'cursor is malformed')
  }

  if (
    !Array.isArray(parsed.k) || parsed.k.length !== 2 ||
    typeof parsed.k[0] !== 'string' || typeof parsed.k[1] !== 'string' ||
    typeof parsed.f !== 'string'
  ) {
    throw new ApiError('invalid_arguments', 'cursor is malformed')
  }

  if (parsed.f !== filterHash(filters)) {
    throw new ApiError(
      'invalid_arguments',
      'cursor was issued for a different filter set; restart pagination',
    )
  }

  return { created_at: parsed.k[0], id: parsed.k[1] }
}
