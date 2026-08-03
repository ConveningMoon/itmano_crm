import 'server-only'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import {
  CURRENCIES, COMMISSION_MODELS, EMPTY_PROFILE, type BusinessProfile,
} from '@/lib/business/profile'

const PROFILE_COLUMNS = columns('tenants', [
  'currency', 'commission_model', 'commission_buy', 'commission_sell',
  'budget_entry_max', 'budget_premium_min', 'primary_areas', 'secondary_areas',
])

// Los números llegan del formulario como string. `''` es "lo dejé vacío", que
// es distinto de 0: se guarda null, no cero.
const numeroOpcional = z.union([z.string(), z.number(), z.null()])
  .transform(v => {
    if (v === null || v === '' || v === undefined) return null
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  })
  .refine(n => n === null || n >= 0, 'No puede ser negativo')

export const BusinessProfileSchema = z.object({
  currency:         z.enum(CURRENCIES).nullable(),
  commissionModel:  z.enum(COMMISSION_MODELS).nullable(),
  commissionBuy:    numeroOpcional,
  commissionSell:   numeroOpcional,
  budgetEntryMax:   numeroOpcional,
  budgetPremiumMin: numeroOpcional,
  primaryAreas:     z.array(z.string().trim().min(1).max(80)).max(30),
  secondaryAreas:   z.array(z.string().trim().min(1).max(80)).max(30),
})
  // Espeja el CHECK de la 086: sin esto se puede guardar un perfil donde el
  // rango medio no existe, y el bucket `mid` desaparece sin ningún aviso.
  .refine(
    p => p.budgetEntryMax === null || p.budgetPremiumMin === null || p.budgetEntryMax < p.budgetPremiumMin,
    { message: 'El tope de "entrada" tiene que ser menor que el piso de "premium"', path: ['budgetEntryMax'] },
  )
  // En porcentaje, un 30 es casi seguro un dedazo (nadie cobra el 30%). El tope
  // no protege la base — la protege a ella de un cero de más.
  .refine(
    p => p.commissionModel !== 'percentage'
      || ((p.commissionBuy ?? 0) <= 25 && (p.commissionSell ?? 0) <= 25),
    { message: 'Un porcentaje de comisión por encima de 25 parece un error', path: ['commissionBuy'] },
  )

export type BusinessProfileInput = z.input<typeof BusinessProfileSchema>

export async function getBusinessProfile(tenantId: string): Promise<BusinessProfile> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(PROFILE_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !data) return EMPTY_PROFILE

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente sin tipar
  const r = data as any
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    currency:         (r.currency ?? null) as BusinessProfile['currency'],
    commissionModel:  (r.commission_model ?? null) as BusinessProfile['commissionModel'],
    commissionBuy:    num(r.commission_buy),
    commissionSell:   num(r.commission_sell),
    budgetEntryMax:   num(r.budget_entry_max),
    budgetPremiumMin: num(r.budget_premium_min),
    primaryAreas:     (r.primary_areas   ?? []) as string[],
    secondaryAreas:   (r.secondary_areas ?? []) as string[],
  }
}

export async function saveBusinessProfile(
  tenantId: string,
  input: BusinessProfileInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = BusinessProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const p = parsed.data

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenants')
    .update({
      currency:           p.currency,
      commission_model:   p.commissionModel,
      commission_buy:     p.commissionBuy,
      commission_sell:    p.commissionSell,
      budget_entry_max:   p.budgetEntryMax,
      budget_premium_min: p.budgetPremiumMin,
      primary_areas:      p.primaryAreas,
      secondary_areas:    p.secondaryAreas,
    })
    .eq('id', tenantId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
