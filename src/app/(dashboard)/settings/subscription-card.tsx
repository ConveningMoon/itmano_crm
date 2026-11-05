'use client'

import { useState, useTransition } from 'react'
import { requestSubscriptionChange, requestSubscriptionCancel, withdrawSubscriptionRequest } from './actions'
import { openBillingPortal } from './billing-actions'
import { PLAN_CONFIG, PLAN_ORDER, SUBSCRIPTION_STATUS_LABELS, BILLING_CYCLE_LABELS, type TenantSubscription, type SubscriptionPlan, type BillingCycle } from '@/lib/subscriptions'
import { PLANS, trialDaysLeft } from '@/lib/plans'
import { PaddleCheckoutButton } from '@/components/dashboard/paddle-checkout-button'
import { FechaLocal } from '@/components/ui/local-date'
import { LABEL, BTN_PRIMARY, BTN_GHOST, CARD, CARD_HEADER } from './settings-styles'

// ─── Subscription card ────────────────────────────────────────────────────────
// Sales-led: sin procesador de pagos todavía, el owner SOLICITA cambio o
// cancelación y el equipo ITMANO la procesa (se le notifica al instante).

export function SubscriptionCard({ subscription, canManage }: {
  subscription: TenantSubscription | null
  canManage: boolean
}) {
  const [mode, setMode] = useState<'view' | 'changing' | 'confirmCancel'>('view')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [checkoutCycle, setCheckoutCycle] = useState<BillingCycle>('month')
  const [portalError, setPortalError] = useState<string | null>(null)
  const [portalPending, startPortalTransition] = useTransition()

  if (!subscription) {
    return (
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Suscripción</span>
        </div>
        <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Este equipo no tiene una suscripción registrada. Contacta a ITMANO.
        </div>
      </div>
    )
  }

  const cfg = PLAN_CONFIG[subscription.plan]
  const hasPendingRequest = subscription.status === 'change_requested' || subscription.status === 'cancel_requested'

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) { setError(res.error); return }
      setMode('view')
      setSelectedPlan(null)
    })
  }

  // La URL del portal de Paddle es de un solo uso y vida corta — se pide al
  // pulsar y se navega de inmediato. Nunca se guarda en estado ni se cachea.
  function openPortal() {
    setPortalError(null)
    startPortalTransition(async () => {
      const res = await openBillingPortal()
      if (!res.ok) { setPortalError(res.error); return }
      window.location.href = res.data.url
    })
  }

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Suscripción</span>
        <span style={{
          fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: subscription.status === 'active' ? 'var(--accent-green)'
               : subscription.status === 'cancelled' ? 'var(--accent-coral)'
               : 'var(--accent-gold)',
          background: subscription.status === 'active' ? 'rgba(107,163,104,0.12)'
                    : subscription.status === 'cancelled' ? 'rgba(201,123,107,0.12)'
                    : 'rgba(201,169,110,0.12)',
        }}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </span>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Plan {cfg.label}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--accent-gold)', marginTop: '2px' }}>{cfg.inversion}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>{cfg.blurb}</div>
        </div>

        {subscription.billingCycle && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {BILLING_CYCLE_LABELS[subscription.billingCycle]}
            {subscription.currentPeriodEnd && (
              <> · Renueva el{' '}
                <FechaLocal fecha={subscription.currentPeriodEnd} locale="es" opciones={{ day: 'numeric', month: 'long' }} />
              </>
            )}
          </div>
        )}

        {subscription.cancelAt && (
          <div style={{ fontSize: '12px', color: 'var(--accent-coral)', background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.25)', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5 }}>
            Tu suscripción termina el{' '}
            <strong><FechaLocal fecha={subscription.cancelAt} locale="es" opciones={{ day: 'numeric', month: 'long' }} /></strong>.
            Conservas el acceso completo hasta entonces.
          </div>
        )}

        {subscription.status === 'trial' && subscription.trialEndsAt && (
          <div style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5 }}>
            {trialDaysLeft(subscription.trialEndsAt) > 0 ? (
              <>Tu período de prueba termina el{' '}
                <strong><FechaLocal fecha={subscription.trialEndsAt} locale="es" opciones={{ day: 'numeric', month: 'long' }} /></strong>
                {' '}({trialDaysLeft(subscription.trialEndsAt)} día{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'} restante{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'}).
                El equipo ITMANO te contactará para elegir tu plan definitivo.</>
            ) : (
              <>Tu período de prueba terminó. El equipo ITMANO te contactará para continuar — o escríbenos a customer@itmano.com.</>
            )}
          </div>
        )}

        {hasPendingRequest && (
          <div style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5 }}>
            {subscription.status === 'change_requested' && subscription.requestedPlan
              ? <>Solicitaste cambiar al plan <strong>{PLAN_CONFIG[subscription.requestedPlan].label}</strong>. El equipo ITMANO te contactará para completar el cambio.</>
              : <>Solicitaste cancelar la suscripción. El equipo ITMANO te contactará para confirmarlo.</>}
            {canManage && (
              <button
                onClick={() => run(withdrawSubscriptionRequest)}
                disabled={pending}
                style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Retirar solicitud
              </button>
            )}
          </div>
        )}

        {/* Botón de inversión — checkout de Paddle. Esencial y Growth se pagan
            directo; Partner solo si el super_admin ya fijó su inversión
            negociada (paddlePriceId). Sin ese precio, Partner sigue el flujo
            de solicitud de abajo.
            El plan actual se oculta solo si ya está pagado y vigente: volver a
            comprarlo crearía una SEGUNDA suscripción en Paddle y, como
            guardamos una sola fila por tenant, la anterior seguiría cobrando
            sin que nadie la vea. En trial o con la suscripción caída, pagar el
            plan actual es precisamente la acción esperada.
            Tampoco se muestra con una solicitud de cambio/cancelación
            pendiente — pagar por su cuenta mientras ITMANO ya está
            procesando esa solicitud sería incoherente. */}
        {canManage && !hasPendingRequest && (() => {
          const canBuy = (p: SubscriptionPlan) =>
            (p !== 'partner' || !!subscription.paddlePriceId) &&
            !(subscription.status === 'active' && p === subscription.plan)
          const buyablePlans = PLAN_ORDER.filter(canBuy)
          if (buyablePlans.length === 0) return null
          return (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={LABEL}>Paga tu inversión</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['month', 'year'] as BillingCycle[]).map(c => (
                    <button
                      key={c}
                      onClick={() => setCheckoutCycle(c)}
                      style={{
                        padding: '4px 10px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                        border: `1px solid ${checkoutCycle === c ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                        background: checkoutCycle === c ? 'rgba(201,169,110,0.08)' : 'transparent',
                        color: checkoutCycle === c ? 'var(--accent-gold)' : 'var(--text-muted)',
                      }}
                    >
                      {BILLING_CYCLE_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {buyablePlans.map(p => (
                  <div key={p} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: '8px',
                  }}>
                    <span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{PLAN_CONFIG[p].label}</span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--accent-gold)', marginTop: '2px' }}>
                        {checkoutCycle === 'year' ? PLANS[p].inversionAnual : PLANS[p].inversion}
                      </span>
                    </span>
                    <PaddleCheckoutButton plan={p} cycle={checkoutCycle} label="Pagar ahora" />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Al pagar se abre el checkout seguro de Paddle. El equipo ITMANO recibe la
                confirmación de inmediato.
              </div>
            </div>
          )
        })()}

        {canManage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
            <button
              onClick={openPortal}
              disabled={portalPending}
              style={{ ...BTN_GHOST, opacity: portalPending ? 0.6 : 1 }}
            >
              {portalPending ? 'Abriendo…' : 'Gestionar inversión y facturas'}
            </button>
            {portalError && (
              <div style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '6px 10px', background: 'rgba(201,123,107,0.08)', borderRadius: '6px' }}>
                {portalError}
              </div>
            )}
          </div>
        )}

        {/* Selector de cambio de plan */}
        {mode === 'changing' && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={LABEL}>Elige el nuevo plan</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PLAN_ORDER.filter(p => p !== subscription.plan).map(p => (
                <label key={p} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                  border: `1px solid ${selectedPlan === p ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px', cursor: 'pointer',
                  background: selectedPlan === p ? 'rgba(201,169,110,0.06)' : 'transparent',
                }}>
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedPlan === p}
                    onChange={() => setSelectedPlan(p)}
                    style={{ marginTop: '2px', accentColor: 'var(--accent-gold)' }}
                  />
                  <span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {PLAN_CONFIG[p].label}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--accent-gold)', marginLeft: '8px' }}>{PLAN_CONFIG[p].inversion}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{PLAN_CONFIG[p].blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => selectedPlan && run(() => requestSubscriptionChange(selectedPlan))}
                disabled={pending || !selectedPlan}
                style={{ ...BTN_PRIMARY, opacity: pending || !selectedPlan ? 0.6 : 1 }}
              >
                {pending ? 'Enviando…' : 'Solicitar cambio'}
              </button>
              <button onClick={() => { setMode('view'); setSelectedPlan(null); setError(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Confirmación de cancelación */}
        {mode === 'confirmCancel' && (
          <div style={{ background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              ¿Solicitar la cancelación de tu suscripción? El equipo ITMANO te contactará para
              confirmarla. Tus datos no se eliminan al enviar la solicitud.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => run(requestSubscriptionCancel)}
                disabled={pending}
                style={{ ...BTN_PRIMARY, background: '#E04040', opacity: pending ? 0.6 : 1 }}
              >
                {pending ? 'Enviando…' : 'Sí, solicitar cancelación'}
              </button>
              <button onClick={() => { setMode('view'); setError(null) }} style={BTN_GHOST}>Volver</button>
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

        {/* Acciones — solo owner/super y sin solicitud pendiente */}
        {canManage && mode === 'view' && !hasPendingRequest && subscription.status !== 'cancelled' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { setMode('changing'); setError(null) }} style={BTN_PRIMARY}>Cambiar de plan</button>
            <button onClick={() => { setMode('confirmCancel'); setError(null) }} style={{ ...BTN_GHOST, color: 'var(--accent-coral)', borderColor: 'rgba(224,64,64,0.3)' }}>
              Cancelar suscripción
            </button>
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          El plan Partner se define a medida con nuestro equipo. Para cancelar tu
          suscripción, usa el portal de inversión o escríbenos.
        </div>
      </div>
    </div>
  )
}
