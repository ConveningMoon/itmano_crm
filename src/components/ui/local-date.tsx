'use client'

import { useSyncExternalStore } from 'react'

// Fechas en la zona horaria de quien mira, sin romper la hidratación.
//
// Un Client Component se renderiza dos veces: en el servidor (Vercel corre en
// UTC) y al hidratar en el navegador (en la zona de cada usuario). Un
// `toLocaleString('es-ES', …)` sin `timeZone` da una hora distinta en cada
// lado; React detecta el texto distinto (error #418), tira el HTML del
// servidor y vuelve a renderizar todo ese tramo en el cliente.
//
// Aquí el servidor y la hidratación formatean en UTC —el mismo texto en los
// dos lados— y, ya hidratado, React vuelve a renderizar con la zona del
// navegador. useSyncExternalStore con instantánea de servidor es el mecanismo
// que React prevé para eso: sin error y sin tirar el HTML. Lo que se ve es la
// hora en UTC durante el instante entre la pintura y la hidratación.

const sinCambios = () => () => {}

/** `false` en el servidor y durante la hidratación; `true` después. */
export function useHidratado(): boolean {
  return useSyncExternalStore(sinCambios, () => true, () => false)
}

function formatear(fecha: string | number | Date, locale: string, opciones: Intl.DateTimeFormatOptions, hidratado: boolean) {
  return new Intl.DateTimeFormat(locale, hidratado ? opciones : { ...opciones, timeZone: 'UTC' })
    .format(new Date(fecha))
}

/** Fecha/hora con `Intl.DateTimeFormat(locale, opciones)` en la zona del navegador. */
export function FechaLocal({ fecha, locale = 'es-ES', opciones }: {
  fecha: string | number | Date
  locale?: string
  opciones: Intl.DateTimeFormatOptions
}) {
  const hidratado = useHidratado()
  return <>{formatear(fecha, locale, opciones, hidratado)}</>
}

// La hora actual como store externo, redondeada al minuto: así la instantánea
// es estable entre lecturas (useSyncExternalStore lo exige) y el tiempo
// relativo se refresca solo cada minuto. En el servidor no hay hora: null.
function suscribirMinuto(avisar: () => void) {
  const id = setInterval(avisar, 60_000)
  return () => clearInterval(id)
}
const minutoActual = () => Math.floor(Date.now() / 60_000) * 60_000
const sinHora = () => null

/**
 * "hace 5 min", "hace 3 h", "hace 2 d" o, pasada la semana, la fecha.
 *
 * Depende de la hora actual, que no es la misma en el servidor que al
 * hidratar: hasta hidratar se pinta la fecha (determinista) y luego el tiempo
 * relativo.
 */
export function TiempoRelativo({ fecha, locale = 'es', opciones = { day: '2-digit', month: '2-digit', year: 'numeric' } }: {
  fecha: string
  locale?: string
  // Formato de la fecha que se pinta antes de hidratar y pasada la semana.
  opciones?: Intl.DateTimeFormatOptions
}) {
  const ahora = useSyncExternalStore(suscribirMinuto, minutoActual, sinHora)
  if (ahora === null) return <>{formatear(fecha, locale, opciones, false)}</>
  const secs = Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 1000))
  if (secs < 60) return <>hace un momento</>
  const mins = Math.floor(secs / 60)
  if (mins < 60) return <>hace {mins} min</>
  const horas = Math.floor(mins / 60)
  if (horas < 24) return <>hace {horas} h</>
  const dias = Math.floor(horas / 24)
  if (dias < 7) return <>hace {dias} d</>
  return <>{formatear(fecha, locale, opciones, true)}</>
}
