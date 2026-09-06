import { z } from 'zod'

/**
 * Marca de dato personal. Viaja al JSON Schema del OpenAPI como
 * `x-itmano-pii: true`, para que el consumidor redacte sus logs leyendo el
 * contrato en vez de una lista aparte que se desincroniza.
 */
export const PII = { 'x-itmano-pii': true } as const

/** Dinero: string decimal + moneda. Nunca coma flotante. */
export const MoneySchema = z.object({
  amount:   z.string().meta({ description: 'Importe decimal como string, con dos decimales.' }),
  currency: z.string().meta({ description: 'Código ISO 4217 del tenant.' }),
}).nullable()

export type Money = z.infer<typeof MoneySchema>

/** Timestamp de Postgres → ISO 8601 en UTC con sufijo Z. */
export function toIso(value: string | null | undefined): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

export function toMoney(
  value: string | number | null | undefined,
  currency: string,
): Money {
  if (value === null || value === undefined) return null
  return { amount: Number(value).toFixed(2), currency }
}

/** Envelope de toda respuesta paginada. `next_cursor` es null en la última página. */
export function PageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data:        z.array(item),
    next_cursor: z.string().nullable().meta({
      description: 'Cursor opaco de la siguiente página; null si no hay más.',
    }),
  })
}

export const ErrorSchema = z.object({
  error: z.object({
    code:      z.string(),
    message:   z.string(),
    retryable: z.boolean(),
    details:   z.unknown().optional(),
  }),
})
