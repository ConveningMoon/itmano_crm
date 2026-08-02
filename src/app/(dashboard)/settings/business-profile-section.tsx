'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertTriangle } from 'lucide-react'
import {
  CURRENCY_SYMBOL, budgetTierFor, expectedCommission, formatMoney, missingFields,
  type BusinessProfile, type Currency, type CommissionModel,
} from '@/lib/business/profile'
import { saveBusinessProfile } from './actions'

// El formulario ES la documentación: lo que aparece aquí es exactamente lo que
// el CRM necesita saber del negocio del cliente, ni más ni menos. Por eso cada
// bloque dice para qué sirve el dato en vez de limitarse a pedirlo.

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
  marginBottom: '16px',
}
const HEAD: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }
const BODY: React.CSSProperties = { padding: '18px 20px' }
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '6px',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '8px',
  border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: '13px',
}
const HINT: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.5 }

type Draft = {
  currency:         Currency | ''
  commissionModel:  CommissionModel | ''
  commissionBuy:    string
  commissionSell:   string
  budgetEntryMax:   string
  budgetPremiumMin: string
}

function toDraft(p: BusinessProfile): Draft {
  const n = (v: number | null) => (v === null ? '' : String(v))
  return {
    currency:         p.currency ?? '',
    commissionModel:  p.commissionModel ?? '',
    commissionBuy:    n(p.commissionBuy),
    commissionSell:   n(p.commissionSell),
    budgetEntryMax:   n(p.budgetEntryMax),
    budgetPremiumMin: n(p.budgetPremiumMin),
  }
}

function toProfile(d: Draft): BusinessProfile {
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  return {
    currency:         d.currency || null,
    commissionModel:  d.commissionModel || null,
    commissionBuy:    n(d.commissionBuy),
    commissionSell:   n(d.commissionSell),
    budgetEntryMax:   n(d.budgetEntryMax),
    budgetPremiumMin: n(d.budgetPremiumMin),
  }
}

export function BusinessProfileSection({ profile }: { profile: BusinessProfile }) {
  const router = useRouter()
  const [draft, setDraft]   = useState<Draft>(() => toDraft(profile))
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)
  const [isPending, start]  = useTransition()

  // Vista previa en vivo: el valor de estos números no se entiende leyéndolos,
  // se entiende viendo qué decidirían. Se recalcula mientras escribes.
  const preview = toProfile(draft)
  const faltan  = missingFields(preview)
  const esPct   = draft.commissionModel === 'percentage'
  const simbolo = draft.currency ? CURRENCY_SYMBOL[draft.currency] : ''

  const EJEMPLOS = [150_000, 300_000, 500_000, 800_000]

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v })); setSaved(false); setError(null)
  }

  function guardar() {
    setError(null)
    start(async () => {
      const res = await saveBusinessProfile(toProfile(draft))
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div>
      <div style={CARD}>
        <div style={HEAD}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Rangos de presupuesto
          </span>
          <div style={HINT}>
            Qué significa &quot;presupuesto alto&quot; en tu mercado. El CRM clasifica a cada lead
            comparándolo con estos cortes, no con una escala global: 300.000 puede ser
            un presupuesto de entrada en una ciudad y premium en otra.
          </div>
        </div>
        <div style={BODY}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label style={LABEL}>Moneda</label>
              <select
                value={draft.currency}
                onChange={e => set('currency', e.target.value as Currency | '')}
                style={INPUT}
              >
                <option value="">Sin definir</option>
                <option value="USD">USD · $</option>
                <option value="EUR">EUR · €</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Hasta aquí es de entrada</label>
              <input
                inputMode="numeric"
                value={draft.budgetEntryMax}
                onChange={e => set('budgetEntryMax', e.target.value)}
                placeholder="250000"
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Desde aquí es premium</label>
              <input
                inputMode="numeric"
                value={draft.budgetPremiumMin}
                onChange={e => set('budgetPremiumMin', e.target.value)}
                placeholder="600000"
                style={INPUT}
              />
            </div>
          </div>

          {/* Lo que estos dos números deciden, con ejemplos concretos. */}
          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {EJEMPLOS.map(monto => {
              const tier = budgetTierFor(monto, preview)
              const color = tier === 'premium' ? 'var(--status-hot)'
                : tier === 'mid' ? 'var(--accent-gold)'
                : tier === 'entry' ? 'var(--text-secondary)' : 'var(--text-muted)'
              return (
                <span key={monto} style={{
                  fontSize: '11.5px', padding: '5px 10px', borderRadius: '999px',
                  border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                  background: `color-mix(in srgb, ${color} 10%, transparent)`,
                  color, whiteSpace: 'nowrap',
                }}>
                  {simbolo}{monto.toLocaleString('es-ES')} → {tier ?? 'sin clasificar'}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={HEAD}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Comisión
          </span>
          <div style={HINT}>
            Lo que la agencia factura por operación cerrada. Sirve para ordenar por valor
            esperado: dos leads igual de buenos no valen lo mismo si uno compra el doble.
          </div>
        </div>
        <div style={BODY}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label style={LABEL}>Modelo</label>
              <select
                value={draft.commissionModel}
                onChange={e => set('commissionModel', e.target.value as CommissionModel | '')}
                style={INPUT}
              >
                <option value="">Sin definir</option>
                <option value="percentage">Porcentaje de la operación</option>
                <option value="flat">Monto fijo por operación</option>
              </select>
            </div>
            <div>
              <label style={LABEL}>Compra {esPct ? '(%)' : simbolo && `(${simbolo})`}</label>
              <input
                inputMode="decimal"
                value={draft.commissionBuy}
                onChange={e => set('commissionBuy', e.target.value)}
                placeholder={esPct ? '3' : '5000'}
                style={INPUT}
              />
            </div>
            <div>
              <label style={LABEL}>Venta {esPct ? '(%)' : simbolo && `(${simbolo})`}</label>
              <input
                inputMode="decimal"
                value={draft.commissionSell}
                onChange={e => set('commissionSell', e.target.value)}
                placeholder={esPct ? '3' : '5000'}
                style={INPUT}
              />
            </div>
          </div>
          <div style={HINT}>
            Si sólo trabajas un lado del mercado, deja el otro vacío.
            {expectedCommission(400_000, preview, 'buy') !== null && (
              <> Con esta configuración, una compra de {formatMoney(400_000, preview.currency)} deja{' '}
                <strong style={{ color: 'var(--accent-green)' }}>
                  {formatMoney(expectedCommission(400_000, preview, 'buy'), preview.currency)}
                </strong>.
              </>
            )}
          </div>
        </div>
      </div>

      {faltan.length > 0 && (
        <div style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start',
          fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '14px',
          padding: '10px 12px', borderRadius: '8px',
          background: 'color-mix(in srgb, var(--accent-gold) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent-gold) 22%, transparent)',
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--accent-gold)', flexShrink: 0, marginTop: '1px' }} />
          <span>
            Falta {faltan.join(', ')}. El CRM funciona igual sin esto — sólo deja de poder
            clasificar presupuestos y de ordenar por valor esperado.
          </span>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '12.5px', color: 'var(--accent-coral)', marginBottom: '12px' }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={guardar}
          disabled={isPending}
          style={{
            padding: '9px 18px', borderRadius: '8px', border: 'none',
            background: 'var(--accent-gold)', color: '#1a1a1a',
            fontSize: '13px', fontWeight: 500,
            cursor: isPending ? 'default' : 'pointer', opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? 'Guardando…' : 'Guardar perfil'}
        </button>
        {saved && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--accent-green)' }}>
            <Check size={14} /> Guardado
          </span>
        )}
      </div>
    </div>
  )
}
