'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

// Edición de provider_settings (migración platform_ops): lo que ITMANO contrata
// y el sistema no puede leer de cada proveedor. Sólo super_admin.

const optionalNumber = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().finite().min(0).nullable(),
)
const optionalInt = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(0).nullable(),
)
const optionalDate = z.preprocess(
  v => (v === '' || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').nullable(),
)
const optionalText = (max: number) => z.preprocess(
  v => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
  z.string().max(max).nullable(),
)

const ProviderSettingSchema = z.object({
  key:                z.string().min(1).max(40),
  plan:               optionalText(60),
  monthly_cost_usd:   optionalNumber,
  monthly_budget_usd: optionalNumber,
  daily_quota:        optionalInt,
  monthly_quota:      optionalInt,
  domain_slots:       optionalInt,
  balance_usd:        optionalNumber,
  renews_on:          optionalDate,
  key_expires_on:     optionalDate,
  last_backup_on:     optionalDate,
  notes:              optionalText(500),
})

export type ProviderSettingInput = z.input<typeof ProviderSettingSchema>

export async function updateProviderSetting(
  input: ProviderSettingInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Solo un administrador de ITMANO puede editar esto.' }

  const parsed = ProviderSettingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  const d = parsed.data

  const db = createAdminClient()
  const { data: current, error: readError } = await db
    .from('provider_settings')
    .select('balance_usd, balance_recorded_at')
    .eq('key', d.key)
    .maybeSingle()
  if (readError) return { ok: false, error: readError.message }
  if (!current) return { ok: false, error: 'Proveedor desconocido.' }

  // El saldo estimado resta el gasto desde que se anotó el saldo: si el saldo
  // cambia, la fecha de referencia es ahora. Si no cambia, se conserva.
  const balanceChanged = (current.balance_usd === null ? null : Number(current.balance_usd)) !== d.balance_usd
  const balance_recorded_at = d.balance_usd === null
    ? null
    : balanceChanged ? new Date().toISOString() : current.balance_recorded_at

  const { error } = await db.from('provider_settings').update({
    plan:                d.plan,
    monthly_cost_usd:    d.monthly_cost_usd,
    monthly_budget_usd:  d.monthly_budget_usd,
    daily_quota:         d.daily_quota,
    monthly_quota:       d.monthly_quota,
    domain_slots:        d.domain_slots,
    balance_usd:         d.balance_usd,
    balance_recorded_at,
    renews_on:           d.renews_on,
    key_expires_on:      d.key_expires_on,
    last_backup_at:      d.last_backup_on ? `${d.last_backup_on}T12:00:00Z` : null,
    notes:               d.notes,
    updated_at:          new Date().toISOString(),
    updated_by:          ctx.user_id,
  }).eq('key', d.key)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/operacion')
  return { ok: true }
}
