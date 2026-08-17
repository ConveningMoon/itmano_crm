import 'server-only'
import { ApiError } from './errors'

// Presupuesto por clase de endpoint. El servidor corta y devuelve 504 con
// cuerpo; el cliente nunca se queda colgado esperando. Ver DESIGN.md §10.
export const DEADLINES = {
  meta:  3000,
  read:  5000,
  write: 8000,
} as const

export type DeadlineKind = keyof typeof DEADLINES

export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>

  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ApiError('timeout', `Request exceeded its ${ms}ms budget`)),
      ms,
    )
  })

  // El rechazo original gana si llega primero: un not_found lento debe seguir
  // siendo un not_found, no convertirse en timeout.
  return Promise.race([work, guard]).finally(() => clearTimeout(timer)) as Promise<T>
}
