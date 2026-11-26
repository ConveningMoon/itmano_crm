'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { getPaddleInstance, initializePaddle, type CheckoutSettings, type PaddleEventData } from '@paddle/paddle-js'
import { Skeleton } from '@/components/ui/skeleton'
import { buildOrderSummary, type OrderSummary } from '@/lib/paddle/checkout-summary'

// Checkout inline de Paddle con el diseño del CRM (fase 5 del plan SaaS).
//
// Es también el "Default payment link" de Paddle: abre el checkout de una
// transacción fuera del CRM — el enlace de "actualiza tu método de pago" de sus
// correos tras un cobro fallido, facturas y cualquier transacción sin URL
// propia. Llega como /pago?_ptxn=txn_… y no hace falta llamar a Checkout.open:
// Paddle.js abre solo la transacción del parámetro al inicializarse, con los
// settings de initializePaddle (inline, dentro de FRAME_CLASS).
//
// "Pagar ahora" de Configuración → Suscripción crea la transacción en el
// servidor y navega aquí con `&desde=crm`: al completar el pago se vuelve sola
// a Configuración. Desde un correo se queda en la confirmación.
//
// Es pública a propósito: quien abre el enlace desde un correo puede no tener
// sesión. El client token es público por diseño (sólo abre checkouts).
//
// Paddle exige en un checkout inline: lo que se compra, subtotal, impuestos y
// total con moneda, cuánto y cada cuánto se renueva, el frame completo con su
// pie (no se puede ocultar ni cambiar) y el enlace a la política de reembolsos.
// El frame sólo pide los datos del pago; el resto lo pinta este componente con
// los eventos de Paddle.js.

type Estado = 'cargando' | 'abierto' | 'sin_enlace' | 'completado' | 'error'

const MENSAJES: Record<Exclude<Estado, 'cargando' | 'abierto'>, { titulo: string; texto: string }> = {
  sin_enlace: { titulo: 'Este enlace no trae un pago', texto: 'Para pagar o cambiar tu plan, entra al CRM y abre Configuración → Suscripción.' },
  completado: { titulo: 'Pago recibido', texto: 'Gracias. Tu suscripción se actualiza en unos segundos; ya puedes volver al CRM.' },
  error:      { titulo: 'No se pudo abrir el pago', texto: 'Intenta de nuevo en unos minutos o escríbenos a customer@itmano.com.' },
}

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ''
const FRAME_CLASS = 'pago-paddle-frame'
const VOLVER_A = '/settings?tab=cuenta'
// Margen para que el webhook escriba la suscripción antes de volver al CRM.
const ESPERA_VOLVER_MS = 3_000

const CHECKOUT_SETTINGS: CheckoutSettings = {
  displayMode:        'inline',
  frameTarget:        FRAME_CLASS,
  frameInitialHeight: 450,
  // Paddle pide min-width ≥ 312px con el padding del checkout activado.
  frameStyle:         'width: 100%; min-width: 312px; background-color: transparent; border: none;',
  theme:              'dark',
  locale:             'es',
}

// El parámetro se lee del navegador y no con useSearchParams para que la
// página quede estática. En el servidor no hay URL: `undefined` = aún no se sabe.
const sinSuscripcion = () => () => {}
const leerQuery = () => window.location.search
const enServidor = () => undefined

export function PagoClient() {
  const router = useRouter()
  const query = useSyncExternalStore(sinSuscripcion, leerQuery, enServidor)
  const params = query === undefined ? null : new URLSearchParams(query)
  const txn = params ? params.get('_ptxn') : undefined
  const desdeCrm = params?.get('desde') === 'crm'

  const [estadoPaddle, setEstado] = useState<Estado>('cargando')
  const [resumen, setResumen] = useState<OrderSummary | null>(null)

  // Paddle.js guarda el eventCallback del primer initialize y sólo lo cambia
  // con Update: el callback estable lee el manejador vigente de este ref.
  const onEvento = useRef<(event: PaddleEventData) => void>(() => {})

  // Lo que se sabe sin abrir Paddle se deriva; el resto lo cuentan sus eventos.
  const estado: Estado =
    txn === undefined ? 'cargando'
    : !txn            ? 'sin_enlace'
    : !TOKEN          ? 'error'
    : estadoPaddle

  useEffect(() => {
    if (!txn || !TOKEN) return
    let activo = true
    onEvento.current = event => {
      if (!activo) return
      if (event.data && (event.name === 'checkout.loaded' || event.name === 'checkout.updated')) {
        setResumen(buildOrderSummary(event.data))
      }
      if (event.name === 'checkout.loaded') setEstado('abierto')
      else if (event.name === 'checkout.completed') setEstado('completado')
      // Una vez cargado, los errores (un dato inválido, un pago rechazado) los
      // explica el propio frame: sólo es fatal si el checkout nunca abrió.
      else if (event.name === 'checkout.error') setEstado(prev => (prev === 'cargando' ? 'error' : prev))
    }
    // Paddle no avisa si la transacción no existe o el token no sirve: si el
    // checkout no carga a tiempo, se dice en vez de girar para siempre.
    const limite = setTimeout(() => {
      if (activo) setEstado(prev => (prev === 'cargando' ? 'error' : prev))
    }, 25_000)
    // Paddle.js abre `_ptxn` solo, pero únicamente al inicializarse. Si ya
    // estaba inicializado (se llegó aquí navegando dentro del CRM después de
    // otra visita), initializePaddle sólo lo actualiza y hay que abrirlo.
    const yaIniciado = getPaddleInstance()?.Initialized === true
    initializePaddle({
      environment:   process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token:         TOKEN,
      checkout:      { settings: CHECKOUT_SETTINGS },
      eventCallback: event => onEvento.current(event),
    }).then(instance => {
      if (!activo) return
      if (!instance) { setEstado('error'); return }
      if (yaIniciado) instance.Checkout.open({ transactionId: txn, settings: CHECKOUT_SETTINGS })
    }).catch(() => {
      if (activo) setEstado('error')
    })
    return () => {
      activo = false
      onEvento.current = () => {}
      clearTimeout(limite)
    }
  }, [txn])

  useEffect(() => {
    if (estado !== 'completado' || !desdeCrm) return
    const t = setTimeout(() => router.replace(VOLVER_A), ESPERA_VOLVER_MS)
    return () => clearTimeout(t)
  }, [estado, desdeCrm, router])

  if (estado === 'sin_enlace' || estado === 'completado' || estado === 'error') {
    const m = MENSAJES[estado]
    const volviendo = estado === 'completado' && desdeCrm
    return (
      <div className="pago-card" role="status" aria-live="polite">
        <h1 className="pago-title">{m.titulo}</h1>
        <p className="pago-text">{volviendo ? 'Gracias. Te llevamos de vuelta a Configuración…' : m.texto}</p>
        {estado !== 'error' && (
          <a className="btn btn-primary" href={VOLVER_A}>
            {volviendo && <span className="loading-spinner" aria-hidden="true" />}
            Ir a Configuración
          </a>
        )}
      </div>
    )
  }

  const cargando = estado === 'cargando'
  return (
    <div className="pago-layout">
      <h1 className="pago-heading">Completa tu pago</h1>
      <ResumenPedido resumen={resumen} />

      <section className="pago-panel pago-checkout" aria-label="Datos de pago" aria-busy={cargando}>
        {cargando && <CheckoutSkeleton />}
        {/* Paddle inserta aquí el iframe. Sin hijos de React a propósito. */}
        <div className={FRAME_CLASS} />
      </section>
    </div>
  )
}

function ResumenPedido({ resumen }: { resumen: OrderSummary | null }) {
  return (
    <aside className="pago-panel pago-summary" aria-label="Resumen del pedido" aria-busy={!resumen}>
      <h2 className="pago-summary-title">Resumen del pedido</h2>

      {!resumen ? (
        <div className="pago-summary-skeleton" role="status" aria-label="Cargando el resumen">
          <Skeleton w="70%" h={14} />
          <Skeleton w="40%" h={11} />
          <Skeleton w="100%" h={1} style={{ margin: '10px 0' }} />
          <Skeleton w="100%" h={12} />
          <Skeleton w="100%" h={12} />
          <Skeleton w="100%" h={22} style={{ marginTop: 6 }} />
        </div>
      ) : (
        <>
          <ul className="pago-lines">
            {resumen.lines.map(line => (
              <li key={line.key} className="pago-line">
                <span className="pago-line-name">
                  {line.name}
                  {line.detail && <span className="pago-line-detail">{line.detail}</span>}
                </span>
                <span className="pago-amount">{line.amount}</span>
              </li>
            ))}
          </ul>

          <dl className="pago-totals">
            <dt>Subtotal</dt><dd>{resumen.subtotal}</dd>
            {resumen.discount && <><dt>Descuento</dt><dd>−{resumen.discount}</dd></>}
            <dt>Impuestos</dt><dd>{resumen.tax}</dd>
            {resumen.credit && <><dt>Crédito a favor</dt><dd>−{resumen.credit}</dd></>}
            <dt className="pago-total-label">Total de hoy</dt>
            <dd className="pago-total-value">{resumen.dueToday}</dd>
          </dl>

          {resumen.renewal && (
            <p className="pago-renewal">
              Después se renueva por <strong>{resumen.renewal.amount}</strong> {resumen.renewal.every}, hasta
              que canceles. Puedes cancelar cuando quieras desde Configuración → Suscripción.
            </p>
          )}
        </>
      )}

      <p className="pago-fine">
        Pago seguro procesado por Paddle. <a href="/reembolsos">Política de reembolsos</a>
      </p>
    </aside>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="pago-checkout-skeleton" role="status" aria-label="Cargando el formulario de pago">
      <Skeleton w="35%" h={12} />
      <Skeleton w="100%" h={40} />
      <Skeleton w="35%" h={12} style={{ marginTop: 8 }} />
      <Skeleton w="100%" h={40} />
      <Skeleton w="100%" h={44} style={{ marginTop: 16 }} />
    </div>
  )
}
