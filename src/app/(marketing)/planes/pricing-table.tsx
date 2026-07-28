'use client'

import { useState } from 'react'
import { PLAN_ORDER, PLANS } from '@/lib/plans'
import { BILLING_CYCLE_LABELS, type BillingCycle } from '@/lib/subscriptions'

// Isla cliente mínima (patrón Tabs / lm-tabs — CLAUDE.md): solo el estado del
// toggle mensual/anual vive aquí. El cuerpo de la tabla comparativa (filas de
// capacidad/producto/IA/acompañamiento) es contenido pre-renderizado por el
// Server Component (planes/page.tsx) y llega como children — no cambia con
// el ciclo, así que no hace falta duplicarlo.
export function PricingTable({ children }: { children: React.ReactNode }) {
  const [cycle, setCycle] = useState<BillingCycle>('month')

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
        <div
          role="tablist"
          aria-label="Ciclo de facturación"
          style={{
            display: 'flex', gap: '4px', padding: '3px',
            border: '1px solid var(--border-subtle)', borderRadius: '9px',
            background: 'var(--bg-elevated)',
          }}
        >
          {(['month', 'year'] as BillingCycle[]).map(c => (
            <button
              key={c}
              role="tab"
              aria-selected={cycle === c}
              onClick={() => setCycle(c)}
              style={{
                padding: '6px 16px', fontSize: '12px', fontWeight: cycle === c ? 500 : 400,
                borderRadius: '6px', cursor: 'pointer', border: 'none',
                background: cycle === c ? 'color-mix(in srgb, var(--accent-gold) 12%, transparent)' : 'transparent',
                color: cycle === c ? 'var(--accent-gold)' : 'var(--text-muted)',
                transition: 'color var(--dur-fast), background var(--dur-fast)',
              }}
            >
              {BILLING_CYCLE_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="pl-table-wrap">
        <table className="pl-table">
          <thead>
            <tr>
              <th />
              {PLAN_ORDER.map(key => {
                const p = PLANS[key]
                return (
                  <th key={key} className={p.highlighted ? 'pl-col-growth' : undefined}>
                    <div className="pl-plan-name" style={{ color: p.highlighted ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                      {p.label}
                    </div>
                    <div className="pl-plan-price mk-num">
                      {cycle === 'year' ? p.inversionAnual : p.inversion}
                    </div>
                    {cycle === 'year' && (
                      <div style={{ fontSize: '11px', color: 'var(--accent-green)', marginTop: '4px', fontWeight: 400 }}>
                        2 meses gratis · ahorras ${p.annualSavingsUsd}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  )
}
