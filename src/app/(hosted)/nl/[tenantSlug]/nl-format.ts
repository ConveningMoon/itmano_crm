// Helpers client-safe para las páginas públicas de newsletters (sin server-only).

export function formatEditionDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** `data_as_of` es un `date` de Postgres (YYYY-MM-DD, sin hora): parsear con
 * mediodía UTC evita que un huso horario negativo lo corra al día anterior. */
export function formatDataAsOf(iso: string | null): string {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}
