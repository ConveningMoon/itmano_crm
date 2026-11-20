'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { updateProviderSetting, type ProviderSettingInput } from './actions'
import type { ProviderSettingRow } from '@/lib/ops/model'

// Formulario de lo que ITMANO contrata con cada proveedor. Cada proveedor
// muestra sólo los campos que le aplican; el resto se conserva tal cual.

type Field = keyof Omit<ProviderSettingInput, 'key'>

const FIELDS_BY_KIND: Record<'resend' | 'ai' | 'supabase' | 'other', Field[]> = {
  resend:   ['plan', 'monthly_cost_usd', 'daily_quota', 'monthly_quota', 'domain_slots', 'renews_on', 'key_expires_on'],
  ai:       ['monthly_budget_usd', 'balance_usd', 'key_expires_on'],
  supabase: ['plan', 'monthly_cost_usd', 'last_backup_on', 'renews_on'],
  other:    ['plan', 'monthly_cost_usd', 'renews_on', 'key_expires_on'],
}

const LABELS: Record<Field, string> = {
  plan:               'Plan',
  monthly_cost_usd:   'Costo mensual (USD)',
  monthly_budget_usd: 'Presupuesto mensual (USD)',
  daily_quota:        'Cuota diaria de correos',
  monthly_quota:      'Cuota mensual de correos',
  domain_slots:       'Dominios incluidos',
  balance_usd:        'Saldo cargado hoy (USD)',
  renews_on:          'Renovación',
  key_expires_on:     'Vence la llave',
  last_backup_on:     'Último backup',
  notes:              'Notas',
}

const NUMERIC: Field[] = ['monthly_cost_usd', 'monthly_budget_usd', 'daily_quota', 'monthly_quota', 'domain_slots', 'balance_usd']
const DATES: Field[] = ['renews_on', 'key_expires_on', 'last_backup_on']

function kindOf(key: string): keyof typeof FIELDS_BY_KIND {
  if (key.startsWith('resend_')) return 'resend'
  if (key === 'anthropic' || key === 'google_ai') return 'ai'
  if (key === 'supabase') return 'supabase'
  return 'other'
}

function initialValues(s: ProviderSettingRow): Record<Field, string> {
  const str = (v: number | string | null) => (v === null ? '' : String(v))
  return {
    plan:               s.plan ?? '',
    monthly_cost_usd:   str(s.monthly_cost_usd),
    monthly_budget_usd: str(s.monthly_budget_usd),
    daily_quota:        str(s.daily_quota),
    monthly_quota:      str(s.monthly_quota),
    domain_slots:       str(s.domain_slots),
    balance_usd:        str(s.balance_usd),
    renews_on:          s.renews_on ?? '',
    key_expires_on:     s.key_expires_on ?? '',
    last_backup_on:     s.last_backup_at ? s.last_backup_at.slice(0, 10) : '',
    notes:              s.notes ?? '',
  }
}

export function ProviderSettingsEditor({ setting }: { setting: ProviderSettingRow }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(() => initialValues(setting))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()
  const fields = FIELDS_BY_KIND[kindOf(setting.key)]
  const id = (f: Field) => `ops-${setting.key}-${f}`

  function save() {
    setError(null); setOk(false)
    start(async () => {
      const res = await updateProviderSetting({ key: setting.key, ...values })
      if (!res.ok) { setError(res.error); return }
      setOk(true); setOpen(false)
    })
  }

  if (!open) {
    return (
      <div className="settings-inline">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setValues(initialValues(setting)); setOpen(true); setOk(false) }}>
          Editar datos del proveedor
        </button>
        {ok && <span className="settings-success" role="status"><Check size={13} aria-hidden="true" /> Guardado</span>}
      </div>
    )
  }

  return (
    <form onSubmit={e => { e.preventDefault(); save() }}>
      <div className="ops-form">
        {fields.map(f => (
          <label key={f} htmlFor={id(f)}>
            {LABELS[f]}
            <input
              id={id(f)}
              className="settings-input"
              type={DATES.includes(f) ? 'date' : NUMERIC.includes(f) ? 'number' : 'text'}
              inputMode={NUMERIC.includes(f) ? 'decimal' : undefined}
              step={NUMERIC.includes(f) ? 'any' : undefined}
              min={NUMERIC.includes(f) ? 0 : undefined}
              value={values[f]}
              onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))}
              disabled={pending}
            />
          </label>
        ))}
        <label htmlFor={id('notes')} className="ops-form-wide">
          {LABELS.notes}
          <input
            id={id('notes')}
            className="settings-input settings-input-wide"
            value={values.notes}
            maxLength={500}
            onChange={e => setValues(v => ({ ...v, notes: e.target.value }))}
            disabled={pending}
          />
        </label>
      </div>
      {error && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}
      <div className="settings-inline" style={{ marginTop: '10px' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
