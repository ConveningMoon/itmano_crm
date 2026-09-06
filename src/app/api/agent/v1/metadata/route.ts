import { defineRoute } from '@/lib/agent-api/handler'
import {
  STAGES, STAGE_CONFIG, QUALITY_BANDS, QUALITY_CONFIG, URGENCIES, URGENCY_CONFIG,
} from '@/lib/scoring/priority'
import { BUCKETS, BUY_DIMS, SELL_DIMS } from '@/lib/scoring/vocabulary'
import { PIPELINE } from '@/lib/agent-api/schemas/deal'
import { getTenantCurrency } from '@/lib/agent-api/queries/leads'

export const runtime = 'nodejs'
export const maxDuration = 30

// Enums vivos del CRM. Existe para que el consumidor no hardcodee vocabulario
// nuestro: si mañana se añade una etapa, aparece aquí sola.
export const GET = defineRoute({
  scope: 'read',
  kind:  'meta',
  handler: async (ctx) => {
    const [currency, owners, channels, propertyStatuses] = await Promise.all([
      getTenantCurrency(ctx),
      ctx.db.from('agents').select('id, name, email, active').order('name'),
      ctx.db.from('acquisition_channels').select('id, name, channel_type').eq('active', true),
      ctx.db.from('properties').select('status'),
    ])

    const estados = [...new Set(
      (propertyStatuses.data ?? [])
        .map(p => (p as { status: string | null }).status)
        .filter((s): s is string => Boolean(s)),
    )].sort()

    return {
      stages:        STAGES.map(v => ({ value: v, label: STAGE_CONFIG[v].label })),
      quality_bands: QUALITY_BANDS.map(v => ({ value: v, label: QUALITY_CONFIG[v].label })),
      urgencies:     URGENCIES.map(v => ({ value: v, label: URGENCY_CONFIG[v].label })),
      pipelines:     [{ value: PIPELINE, label: 'Compra' }],

      owners:   owners.data   ?? [],
      channels: channels.data ?? [],
      property_statuses: estados,

      // Dimensiones de fit que acepta POST /leads. Un lead es comprador O
      // vendedor, nunca ambos, y por eso los dos conjuntos son excluyentes.
      fit_dimensions: {
        buy:     BUY_DIMS,
        sell:    SELL_DIMS,
        buckets: BUCKETS,
      },

      currency,
      locales: ['es', 'en', 'pt'],

      // Explícito: este CRM no tiene campos personalizados. Se declara vacío en
      // vez de omitirse para que el consumidor no tenga que adivinar si existen.
      custom_fields: [],
    }
  },
})
