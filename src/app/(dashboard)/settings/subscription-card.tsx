'use client'

import { useState, useTransition } from 'react'
import { AlertCircle } from 'lucide-react'
import { requestSubscriptionChange, requestSubscriptionCancel, withdrawSubscriptionRequest } from './actions'
import { openBillingPortal } from './billing-actions'
import { PLAN_CONFIG, PLAN_ORDER, SUBSCRIPTION_STATUS_LABELS, BILLING_CYCLE_LABELS, type TenantSubscription, type SubscriptionPlan, type BillingCycle } from '@/lib/subscriptions'
import { PLANS, trialDaysLeft } from '@/lib/plans'
import { PaddleCheckoutButton } from '@/components/dashboard/paddle-checkout-button'
import { FechaLocal } from '@/components/ui/local-date'
import { SettingsCard, SettingsRow } from '@/components/ui/settings-row'
import { InfoHint } from '@/components/ui/info-hint'

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
      <SettingsCard title="Suscripción">
        <p className="settings-note">Este equipo no tiene una suscripción registrada. Contacta a ITMANO.</p>
      </SettingsCard>
    )
  }

  const cfg = PLAN_CONFIG[subscription.plan]
  const hasPendingRequest = subscription.status === 'change_requested' || subscription.status === 'cancel_requested'
  const statusTone = subscription.status === 'active' ? 'green'
                   : subscription.status === 'cancelled' ? 'coral'
                   : 'gold'

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
    <SettingsCard
      title="Suscripción"
      action={
        <span className="pill" data-tone={statusTone}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </span>
      }
    >
      <SettingsRow label="Plan">
        <div className="settings-inline">
          <span className="settings-value">Plan {cfg.label}</span>
          <InfoHint label="Sobre el plan Partner">
            El plan Partner se define a medida con nuestro equipo. Para cancelar tu
            suscripción, usa el portal de inversión o escríbenos.
          </InfoHint>
        </div>
        <p className="settings-note settings-note-gap">{cfg.blurb}</p>
      </SettingsRow>

      <SettingsRow label="Inversión">
        <span className="settings-value">{cfg.inversion}</span>
      </SettingsRow>

      {subscription.billingCycle && (
        <SettingsRow label="Facturación">
          <span className="settings-value">
            {BILLING_CYCLE_LABELS[subscription.billingCycle]}
            {subscription.currentPeriodEnd && (
              <> · Renueva el{' '}
                <FechaLocal fecha={subscription.currentPeriodEnd} locale="es" opciones={{ day: 'numeric', month: 'long' }} />
              </>
            )}
          </span>
        </SettingsRow>
      )}

      <div className="settings-stack settings-stack-top">
        {subscription.cancelAt && (
          <div className="settings-alert settings-alert-block" role="alert">
            <AlertCircle size={14} aria-hidden="true" />
            <span>
              Tu suscripción termina el{' '}
              <strong><FechaLocal fecha={subscription.cancelAt} locale="es" opciones={{ day: 'numeric', month: 'long' }} /></strong>.
              Conservas el acceso completo hasta entonces.
            </span>
          </div>
        )}

        {subscription.status === 'trial' && subscription.trialEndsAt && (
          <div className="settings-note settings-note-gold">
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
          <div className="settings-note settings-note-gold">
            {subscription.status === 'change_requested' && subscription.requestedPlan
              ? <>Solicitaste cambiar al plan <strong>{PLAN_CONFIG[subscription.requestedPlan].label}</strong>. El equipo ITMANO te contactará para completar el cambio.</>
              : <>Solicitaste cancelar la suscripción. El equipo ITMANO te contactará para confirmarlo.</>}
            {canManage && (
              <>
                {' '}
                <button
                  type="button"
                  className="settings-link-btn"
                  onClick={() => run(withdrawSubscriptionRequest)}
                  disabled={pending}
                >
                  {pending ? 'Retirando…' : 'Retirar solicitud'}
                </button>
              </>
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
            <div className="settings-panel">
              <div className="settings-inline settings-inline-between">
                <span className="settings-option-name">Paga tu inversión</span>
                <div className="settings-inline settings-inline-tight">
                  {(['month', 'year'] as BillingCycle[]).map(c => (
                    <button
                      key={c}
                      type="button"
                      className="settings-cycle"
                      aria-pressed={checkoutCycle === c}
                      onClick={() => setCheckoutCycle(c)}
                    >
                      {BILLING_CYCLE_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-stack settings-stack-tight">
                {buyablePlans.map(p => (
                  <div key={p} className="settings-option settings-option-center">
                    <span>
                      <span className="settings-option-name">{PLAN_CONFIG[p].label}</span>
                      <span className="settings-option-price">
                        {checkoutCycle === 'year' ? PLANS[p].inversionAnual : PLANS[p].inversion}
                      </span>
                    </span>
                    <PaddleCheckoutButton plan={p} cycle={checkoutCycle} label="Pagar ahora" />
                  </div>
                ))}
              </div>
              <p className="settings-note">
                Al pagar se abre el checkout seguro de Paddle. El equipo ITMANO recibe la
                confirmación de inmediato.
              </p>
            </div>
          )
        })()}

        {canManage && (
          <div className="settings-stack settings-stack-tight settings-stack-start">
            <button type="button" className="btn btn-ghost" onClick={openPortal} disabled={portalPending}>
              {portalPending ? 'Abriendo…' : 'Gestionar inversión y facturas'}
            </button>
            {portalError && (
              <p className="settings-alert" role="alert">
                <AlertCircle size={13} aria-hidden="true" /> {portalError}
              </p>
            )}
          </div>
        )}

        {/* Selector de cambio de plan */}
        {mode === 'changing' && (
          <div className="settings-panel">
            <span className="settings-option-name">Elige el nuevo plan</span>
            <div className="settings-stack settings-stack-tight" role="radiogroup" aria-label="Nuevo plan">
              {PLAN_ORDER.filter(p => p !== subscription.plan).map(p => (
                <label key={p} className="settings-option settings-option-radio" data-selected={selectedPlan === p}>
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedPlan === p}
                    onChange={() => setSelectedPlan(p)}
                  />
                  <span>
                    <span className="settings-option-name">{PLAN_CONFIG[p].label}</span>
                    <span className="settings-option-price settings-option-price-inline">{PLAN_CONFIG[p].inversion}</span>
                    <span className="settings-note settings-note-gap">{PLAN_CONFIG[p].blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-inline settings-inline-tight">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => selectedPlan && run(() => requestSubscriptionChange(selectedPlan))}
                disabled={pending || !selectedPlan}
              >
                {pending ? 'Enviando…' : 'Solicitar cambio'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('view'); setSelectedPlan(null); setError(null) }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Confirmación de cancelación */}
        {mode === 'confirmCancel' && (
          <div className="settings-panel settings-panel-danger">
            <p className="settings-value settings-confirm-text">
              ¿Solicitar la cancelación de tu suscripción? El equipo ITMANO te contactará para
              confirmarla. Tus datos no se eliminan al enviar la solicitud.
            </p>
            <div className="settings-inline settings-inline-tight">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => run(requestSubscriptionCancel)}
                disabled={pending}
              >
                {pending ? 'Enviando…' : 'Sí, solicitar cancelación'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setMode('view'); setError(null) }}>Volver</button>
            </div>
          </div>
        )}

        {error && (
          <p className="settings-alert" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {error}
          </p>
        )}

        {/* Acciones — solo owner/super y sin solicitud pendiente */}
        {canManage && mode === 'view' && !hasPendingRequest && subscription.status !== 'cancelled' && (
          <div className="settings-inline settings-inline-tight">
            <button type="button" className="btn btn-primary" onClick={() => { setMode('changing'); setError(null) }}>Cambiar de plan</button>
            <button type="button" className="btn btn-danger" onClick={() => { setMode('confirmCancel'); setError(null) }}>
              Cancelar suscripción
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  )
}
