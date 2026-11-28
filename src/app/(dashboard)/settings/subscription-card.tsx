'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { requestSubscriptionChange, requestSubscriptionCancel, withdrawSubscriptionRequest } from './actions'
import {
  cancelSubscriptionAction, changePlanAction, openBillingPortal, previewPlanChangeAction, resumePausedAction, resumeSubscriptionAction,
} from './billing-actions'
import { PLAN_CONFIG, PLAN_ORDER, checkoutPlans, SUBSCRIPTION_STATUS_LABELS, BILLING_CYCLE_LABELS, type TenantSubscription, type SubscriptionPlan, type BillingCycle } from '@/lib/subscriptions'
import { PLANS, PARTNER_SEAT, trialDaysLeft } from '@/lib/plans'
import { billingMode } from '@/lib/paddle/self-service'
import type { PlanChangePreview } from '@/lib/paddle/manage'
import { PaddleCheckoutButton } from '@/components/dashboard/paddle-checkout-button'
import { FechaLocal } from '@/components/ui/local-date'
import { SettingsCard, SettingsRow } from '@/components/ui/settings-row'

// ─── Subscription card ────────────────────────────────────────────────────────
// Dos modos (fase 5 del plan SaaS, src/lib/paddle/self-service.ts):
//   · Autoservicio: con una suscripción viva en Paddle, el owner cambia de plan
//     o de ciclo (con vista previa del cobro), cancela al final del período y
//     reactiva, sin pasar por ITMANO. El estado lo confirma el webhook.
//   · Solicitud: exentos (piloto), Partner con precio acordado o sin suscripción
//     de pago. El owner SOLICITA y el equipo ITMANO lo procesa.

export interface BillingOptions {
  /** Partner tiene precios de catálogo y de asiento configurados. */
  partnerCatalog: boolean
  /** El plan actual es un Partner con precio negociado (excepción). */
  negotiated:     boolean
}

const DATE_SIN_ANIO = { day: 'numeric', month: 'long' } as const
const DATE_CON_ANIO = { day: 'numeric', month: 'long', year: 'numeric' } as const

// Una renovación anual cae en otro año: sin el año, "26 de noviembre" parece
// hoy. Dentro del año en curso se omite para que se lea corto.
function opcionesFecha(iso: string): Intl.DateTimeFormatOptions {
  return new Date(iso).getUTCFullYear() === new Date().getUTCFullYear() ? DATE_SIN_ANIO : DATE_CON_ANIO
}

export function SubscriptionCard({ subscription, canManage, billingOptions }: {
  subscription:   TenantSubscription | null
  canManage:      boolean
  billingOptions: BillingOptions
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'changing' | 'confirmCancel'>('view')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [targetCycle, setTargetCycle] = useState<BillingCycle>(subscription?.billingCycle ?? 'month')
  const [preview, setPreview] = useState<PlanChangePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [previewPending, startPreview] = useTransition()
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
  const modo = billingMode({
    plan:                 subscription.plan,
    status:               subscription.status,
    billingExempt:        subscription.billingExempt,
    billingCycle:         subscription.billingCycle,
    paddleSubscriptionId: subscription.paddleSubscriptionId,
    cancelAt:             subscription.cancelAt,
    negotiatedPriceId:    billingOptions.negotiated ? 'negotiated' : null,
  })
  const selfService = modo === 'self_service'
  const pausedInPaddle = modo === 'paused'
  // La inversión que se paga de verdad: con facturación anual, el precio anual.
  const inversion = subscription.billingCycle === 'year' ? PLANS[subscription.plan].inversionAnual : cfg.inversion
  const hasPendingRequest = subscription.status === 'change_requested' || subscription.status === 'cancel_requested'
  const statusTone = subscription.status === 'active' ? 'green'
                   : subscription.status === 'cancelled' ? 'coral'
                   : 'gold'
  const changeablePlans = PLAN_ORDER.filter(p => p !== 'partner' || billingOptions.partnerCatalog)

  function resetPanel() {
    setMode('view'); setSelectedPlan(null); setPreview(null); setError(null)
  }

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) { setError(res.error); return }
      resetPanel()
    })
  }

  // Acciones contra Paddle: el webhook escribe el estado nuevo unos segundos
  // después. Se refresca al instante y otra vez al rato para recogerlo.
  function runPaddle(action: () => Promise<{ ok: true; data: null } | { ok: false; error: string }>, done: string) {
    setError(null); setNotice(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) { setError(res.error); return }
      resetPanel()
      setNotice(done)
      router.refresh()
      setTimeout(() => router.refresh(), 5000)
    })
  }

  function choose(plan: SubscriptionPlan, cycle: BillingCycle) {
    setSelectedPlan(plan); setTargetCycle(cycle); setPreview(null); setError(null)
    if (plan === subscription!.plan && cycle === subscription!.billingCycle) return
    startPreview(async () => {
      const res = await previewPlanChangeAction(plan, cycle)
      if (!res.ok) { setError(res.error); return }
      setPreview(res.data)
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

  const isCurrentTarget = selectedPlan === subscription.plan && targetCycle === subscription.billingCycle

  return (
    <SettingsCard
      title="Suscripción"
      action={
        <span className="pill" data-tone={statusTone}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </span>
      }
    >
      <SettingsRow
        label="Plan"
        hint={selfService
          ? 'Puedes cambiar de plan o cancelar cuando quieras desde aquí.'
          : 'Para cambiar o cancelar tu plan, envía una solicitud y el equipo ITMANO la procesa.'}
      >
        <span className="settings-value">Plan {cfg.label}</span>
        <p className="settings-note settings-note-gap">{cfg.blurb}</p>
        {subscription.plan === 'partner' && !billingOptions.negotiated && (
          <p className="settings-note settings-note-gap">
            Incluye {PARTNER_SEAT.includedLogins} logins. Cada login adicional suma ${PARTNER_SEAT.extraLoginUsd}/mes y se
            ajusta solo al dar o quitar acceso, prorrateado.
          </p>
        )}
      </SettingsRow>

      <SettingsRow label="Inversión">
        <span className="settings-value">{inversion}</span>
      </SettingsRow>

      {subscription.billingCycle && (
        <SettingsRow label="Facturación">
          <span className="settings-value">
            {BILLING_CYCLE_LABELS[subscription.billingCycle]}
            {subscription.currentPeriodEnd && !subscription.cancelAt && (
              <> · Renueva el{' '}
                <FechaLocal fecha={subscription.currentPeriodEnd} locale="es" opciones={opcionesFecha(subscription.currentPeriodEnd)} />
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
              <strong><FechaLocal fecha={subscription.cancelAt} locale="es" opciones={opcionesFecha(subscription.cancelAt)} /></strong>.
              Conservas el acceso completo hasta entonces.
              {canManage && selfService && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="settings-link-btn"
                    onClick={() => runPaddle(resumeSubscriptionAction, 'Listo: tu suscripción seguirá renovándose.')}
                    disabled={pending}
                  >
                    {pending ? 'Reactivando…' : 'Reactivar suscripción'}
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        {notice && <p className="settings-note settings-note-gold" role="status">{notice}</p>}

        {subscription.status === 'trial' && subscription.trialEndsAt && (
          <div className="settings-note settings-note-gold">
            {trialDaysLeft(subscription.trialEndsAt) > 0 ? (
              <>Tu período de prueba termina el{' '}
                <strong><FechaLocal fecha={subscription.trialEndsAt} locale="es" opciones={opcionesFecha(subscription.trialEndsAt)} /></strong>
                {' '}({trialDaysLeft(subscription.trialEndsAt)} día{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'} restante{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'}).
                Elige tu plan con &quot;Pagar ahora&quot; para seguir sin interrupciones.</>
            ) : (
              <>Tu período de prueba terminó. Elige tu plan con &quot;Pagar ahora&quot; para recuperar el acceso completo, o escríbenos a customer@itmano.com.</>
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

        {/* Pausada en Paddle (p. ej. tras agotarse los reintentos de cobro): la
            suscripción sigue existiendo y se reanuda; un checkout nuevo crearía
            una segunda. Si la tarjeta falló, se cambia antes en el portal. */}
        {canManage && pausedInPaddle && (
          <div className="settings-panel">
            <p className="settings-note">
              Tu suscripción está en pausa. Al reactivarla, Paddle cobra el período y recuperas el acceso
              completo de inmediato. Si tu último pago falló, actualiza primero la tarjeta en
              &quot;Gestionar tarjeta y facturas&quot;.
            </p>
            <div className="settings-inline settings-inline-tight">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => runPaddle(resumePausedAction, 'Listo: Paddle confirma la reactivación en unos segundos y esta página se actualiza sola.')}
                disabled={pending}
              >
                {pending ? 'Reactivando…' : 'Reactivar suscripción'}
              </button>
            </div>
          </div>
        )}

        {/* Botón de inversión — checkout NUEVO de Paddle. Qué planes se
            ofrecen y por qué lo decide checkoutPlans(): con la suscripción
            activa nunca se ofrece otro plan (crearía una segunda suscripción
            que seguiría cobrando); para mejorar está "Cambiar de plan".
            Tampoco se muestra con una solicitud de cambio/cancelación
            pendiente — pagar por su cuenta mientras ITMANO ya está
            procesando esa solicitud sería incoherente. */}
        {canManage && !hasPendingRequest && (() => {
          // Regla y motivo en checkoutPlans (src/lib/subscriptions.ts).
          const buyablePlans = checkoutPlans(subscription, { partnerCatalog: billingOptions.partnerCatalog })
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

        {canManage && subscription.paddleCustomerId && (
          <div className="settings-stack settings-stack-tight settings-stack-start">
            <button type="button" className="btn btn-ghost" onClick={openPortal} disabled={portalPending}>
              {portalPending ? 'Abriendo…' : 'Gestionar tarjeta y facturas'}
            </button>
            {portalError && (
              <p className="settings-alert" role="alert">
                <AlertCircle size={13} aria-hidden="true" /> {portalError}
              </p>
            )}
          </div>
        )}

        {/* Cambio de plan en autoservicio: plan + ciclo, vista previa del cobro
            calculada por Paddle y confirmación. */}
        {mode === 'changing' && selfService && (
          <div className="settings-panel">
            <div className="settings-inline settings-inline-between">
              <span className="settings-option-name">Elige el nuevo plan</span>
              <div className="settings-inline settings-inline-tight">
                {(['month', 'year'] as BillingCycle[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    className="settings-cycle"
                    aria-pressed={targetCycle === c}
                    onClick={() => selectedPlan ? choose(selectedPlan, c) : setTargetCycle(c)}
                  >
                    {BILLING_CYCLE_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-stack settings-stack-tight" role="radiogroup" aria-label="Nuevo plan">
              {changeablePlans.map(p => (
                <label key={p} className="settings-option settings-option-radio" data-selected={selectedPlan === p}>
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedPlan === p}
                    onChange={() => choose(p, targetCycle)}
                  />
                  <span>
                    <span className="settings-option-name">
                      {PLAN_CONFIG[p].label}{p === subscription.plan ? ' (actual)' : ''}
                    </span>
                    <span className="settings-option-price settings-option-price-inline">
                      {targetCycle === 'year' ? PLANS[p].inversionAnual : PLANS[p].inversion}
                    </span>
                    <span className="settings-note settings-note-gap">{PLAN_CONFIG[p].blurb}</span>
                  </span>
                </label>
              ))}
            </div>

            {selectedPlan && isCurrentTarget && (
              <p className="settings-note">Ya tienes ese plan con ese ciclo de facturación.</p>
            )}
            {previewPending && <p className="settings-note" role="status">Calculando el cambio con Paddle…</p>}
            {preview && !previewPending && (
              <p className="settings-note settings-note-gold" role="status">
                {preview.action === 'charge'
                  ? <>Se cobra hoy <strong>{preview.amount}</strong> por la diferencia del período en curso.</>
                  : <>Te queda <strong>{preview.amount}</strong> a favor, que se descuenta de tus próximos cobros.</>}
                {preview.recurring && <> Después pagarás <strong>{preview.recurring}</strong> por {targetCycle === 'year' ? 'año' : 'mes'}.</>}
              </p>
            )}

            <div className="settings-inline settings-inline-tight">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => selectedPlan && runPaddle(
                  () => changePlanAction(selectedPlan, targetCycle),
                  'Listo: Paddle confirma el cambio en unos segundos y esta página se actualiza sola.',
                )}
                disabled={pending || previewPending || !preview || !selectedPlan}
              >
                {pending ? 'Cambiando…' : 'Confirmar cambio'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetPanel}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Cambio de plan por solicitud (exentos, Partner acordado, sin Paddle) */}
        {mode === 'changing' && !selfService && (
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
              <button type="button" className="btn btn-ghost" onClick={resetPanel}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Confirmación de cancelación */}
        {mode === 'confirmCancel' && (
          <div className="settings-panel settings-panel-danger">
            {selfService ? (
              <p className="settings-value settings-confirm-text">
                ¿Cancelar tu suscripción? Se cancela al final del período pagado
                {subscription.currentPeriodEnd && (
                  <> (<FechaLocal fecha={subscription.currentPeriodEnd} locale="es" opciones={opcionesFecha(subscription.currentPeriodEnd)} />)</>
                )}: conservas todo hasta entonces y puedes reactivarla antes. Tus datos no se eliminan.
              </p>
            ) : (
              <p className="settings-value settings-confirm-text">
                ¿Solicitar la cancelación de tu suscripción? El equipo ITMANO te contactará para
                confirmarla. Tus datos no se eliminan al enviar la solicitud.
              </p>
            )}
            <div className="settings-inline settings-inline-tight">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => selfService
                  ? runPaddle(cancelSubscriptionAction, 'Listo: la cancelación quedó programada. Puedes reactivarla hasta esa fecha.')
                  : run(requestSubscriptionCancel)}
                disabled={pending}
              >
                {pending ? 'Enviando…' : selfService ? 'Sí, cancelar al final del período' : 'Sí, solicitar cancelación'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={resetPanel}>Volver</button>
            </div>
          </div>
        )}

        {error && (
          <p className="settings-alert" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {error}
          </p>
        )}

        {/* Acciones — solo owner/super, sin solicitud pendiente, sin cancelación
            programada y sin pausa en Paddle (ahí la única acción es reanudar) */}
        {canManage && mode === 'view' && !hasPendingRequest && !pausedInPaddle && subscription.status !== 'cancelled' && !subscription.cancelAt && (
          <div className="settings-inline settings-inline-tight">
            <button type="button" className="btn btn-primary" onClick={() => { setMode('changing'); setError(null); setNotice(null) }}>Cambiar de plan</button>
            <button type="button" className="btn btn-danger" onClick={() => { setMode('confirmCancel'); setError(null); setNotice(null) }}>
              Cancelar suscripción
            </button>
          </div>
        )}
      </div>
    </SettingsCard>
  )
}
