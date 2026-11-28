'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { initializePaddle } from '@paddle/paddle-js'

// Enlace de pago predeterminado de Paddle (fase 5 del plan SaaS). Paddle lo usa
// para abrir el checkout de una transacción fuera del CRM: el enlace de
// "actualiza tu método de pago" de sus correos tras un cobro fallido, facturas
// y cualquier transacción sin URL propia. Llega como /pago?_ptxn=txn_…
//
// No hace falta llamar a Checkout.open: Paddle.js abre solo la transacción del
// parámetro `_ptxn` al inicializarse. Aquí sólo se inicializa y se muestra en
// qué punto está, para que quien llega no vea una página en blanco.
//
// Es pública a propósito: quien abre el enlace desde un correo puede no tener
// sesión. El client token es público por diseño (sólo abre checkouts).

type Estado = 'cargando' | 'abierto' | 'sin_enlace' | 'completado' | 'cerrado' | 'error'

const MENSAJES: Record<Estado, { titulo: string; texto: string }> = {
  cargando:   { titulo: 'Abriendo el pago seguro…', texto: 'Un momento: estamos cargando el checkout de Paddle.' },
  abierto:    { titulo: 'Completa tu pago', texto: 'El checkout seguro de Paddle está abierto en esta página.' },
  sin_enlace: { titulo: 'Este enlace no trae un pago', texto: 'Para pagar o cambiar tu plan, entra al CRM y abre Configuración → Suscripción.' },
  completado: { titulo: 'Pago recibido', texto: 'Gracias. Tu suscripción se actualiza en unos segundos; ya puedes volver al CRM.' },
  cerrado:    { titulo: 'Cerraste el pago', texto: 'No se cobró nada. Puedes volver a abrir el enlace del correo cuando quieras.' },
  error:      { titulo: 'No se pudo abrir el pago', texto: 'Intenta de nuevo en unos minutos o escríbenos a customer@itmano.com.' },
}

const TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ''

// El parámetro se lee del navegador y no con useSearchParams para que la
// página quede estática. En el servidor no hay URL: `undefined` = aún no se sabe.
const sinSuscripcion = () => () => {}
const leerTxn = () => new URLSearchParams(window.location.search).get('_ptxn')
const enServidor = () => undefined

export function PagoClient() {
  const txn = useSyncExternalStore(sinSuscripcion, leerTxn, enServidor)
  const [estadoPaddle, setEstado] = useState<Estado>('cargando')

  // Lo que se sabe sin abrir Paddle se deriva; el resto lo cuentan sus eventos.
  const estado: Estado =
    txn === undefined ? 'cargando'
    : !txn            ? 'sin_enlace'
    : !TOKEN          ? 'error'
    : estadoPaddle

  useEffect(() => {
    if (!txn || !TOKEN) return
    let activo = true
    // Paddle no avisa si la transacción no existe o el token no sirve: si el
    // checkout no carga a tiempo, se dice en vez de girar para siempre.
    const limite = setTimeout(() => {
      if (activo) setEstado(prev => (prev === 'cargando' ? 'error' : prev))
    }, 25_000)
    initializePaddle({
      environment: process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox',
      token:       TOKEN,
      checkout:    { settings: { displayMode: 'overlay', theme: 'dark', locale: 'es' } },
      eventCallback: event => {
        if (!activo) return
        if (event.name === 'checkout.loaded') setEstado('abierto')
        else if (event.name === 'checkout.completed') setEstado('completado')
        else if (event.name === 'checkout.closed') setEstado(prev => (prev === 'completado' ? prev : 'cerrado'))
        else if (event.name === 'checkout.error') setEstado('error')
      },
    }).then(instance => {
      if (activo && !instance) setEstado('error')
    }).catch(() => {
      if (activo) setEstado('error')
    })
    return () => { activo = false; clearTimeout(limite) }
  }, [txn])

  const m = MENSAJES[estado]
  return (
    <div className="pago-card" role="status" aria-live="polite">
      {estado === 'cargando' && <span className="loading-spinner" aria-hidden="true" />}
      <h1 className="pago-title">{m.titulo}</h1>
      <p className="pago-text">{m.texto}</p>
      {(estado === 'completado' || estado === 'sin_enlace' || estado === 'cerrado') && (
        <a className="btn btn-primary" href="/settings">Ir a Configuración</a>
      )}
    </div>
  )
}
