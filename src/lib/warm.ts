// Mantener caliente la base mientras alguien usa el CRM: reglas puras del latido
// que hace DbWarmer (src/components/layout/db-warmer.tsx). Sin React ni Next
// para poder probarlas en Node.
//
// Por qué existe: la base corre en un compute Nano de Supabase y se enfría
// rápido. Mediana de una consulta de la app según el tiempo que llevaba la base
// sin recibir nada (logs de la API de producción, 24 h, llamadas desde Vercel):
//
//   < 20 s     32-36 ms        45-90 s    119 ms
//   20-45 s    67 ms           90-150 s   210 ms
//   150 s o más  430-460 ms (13 veces más lenta)
//
// Con poco tráfico, casi cada clic de quien lee una página un rato cae en la
// zona lenta: cada ola de consultas paga el recargo y el contenido tarda 0,4-1,3 s
// en llegar tras un shell que sale en ~90 ms.
//
// El latido va a /api/warm cada ~10 s (por debajo de los 20 s de la zona
// rápida) mientras la pestaña está a la vista y la persona ha hecho algo hace
// poco. Se para solo: una pestaña olvidada abierta no mantiene la base
// despierta ni gasta invocaciones.

/** Separación mínima entre dos latidos; el real queda entre ésta y +EVALUAR_CADA_MS. */
export const LATIDO_MS = 10_000

/** Cada cuánto se evalúa si toca latir. */
export const EVALUAR_CADA_MS = 3_000

/** Sin actividad de la persona durante este tiempo, el latido se detiene. */
export const INACTIVIDAD_MAX_MS = 5 * 60_000

export interface EstadoLatido {
  ahora: number
  /** Marca de tiempo del último latido enviado (0 si ninguno). */
  ultimoLatido: number
  /** Última vez que la persona pulsó, tecleó, tocó o hizo scroll. */
  ultimaActividad: number
  visible: boolean
  enLinea: boolean
}

/** ¿Hay que mandar un latido ahora? */
export function debeLatir(e: EstadoLatido): boolean {
  if (!e.visible || !e.enLinea) return false
  if (e.ahora - e.ultimaActividad > INACTIVIDAD_MAX_MS) return false
  return e.ahora - e.ultimoLatido >= LATIDO_MS
}

// El latido también renueva la sesión, con margen. El token de Supabase dura
// una hora y antes sólo se renovaba al caducar. Quien volvía de una pausa lo
// encontraba caducado con probabilidad pausa/60 min. Entonces cada petición en
// paralelo (la navegación y el prefetch de cada enlace del menú) lo renovaba
// por su cuenta en el proxy. En producción hubo ráfagas de 4-9 renovaciones
// de 170-720 ms cada una (2026-10-10).
//
// Renovando cuando quedan menos de 45 minutos, la persona deja el CRM con 45-60
// minutos de token por delante, y una pausa de menos de 45 minutos ya no paga
// nada. Una pausa de más de una hora sigue renovando al volver, como antes.

// El latido de vuelta también calienta el camino de las páginas. Tras ~10
// minutos sin tráfico, en producción la primera página pagaba ~2 s antes de su
// primera consulta (medido el 2026-10-11):
//   - ~0,4-0,9 s por el proxy del borde de esa persona;
//   - el resto por el camino propio de las páginas, que un Route Handler como
//     /api/warm no calienta.
// Al volver de una pausa, el primer latido sale con el primer movimiento del
// ratón o al volver a la pestaña, antes del clic. Por eso ese latido pide
// además /latido, una página vacía dentro del matcher. Así calienta el proxy
// del borde de esa persona, esté donde esté, y la función de las páginas.
//
// Los latidos seguidos van sólo a /api/warm, porque las propias navegaciones ya
// mantienen caliente ese camino. Abrir el CRM desde cero no lo cubre: antes de
// esa primera página no hay latido.

/** Tras esta pausa sin latidos, el siguiente también calienta el camino de las páginas. */
export const VUELTA_MS = 3 * 60_000

/** ¿Es este latido el de vuelta tras una pausa? `ultimoLatido` es 0 si aún no hubo ninguno. */
export function esLatidoDeVuelta(ahora: number, ultimoLatido: number): boolean {
  // Sin latidos previos, la página acaba de cargar y su petición ya hizo ese camino.
  return ultimoLatido > 0 && ahora - ultimoLatido >= VUELTA_MS
}

/** Con menos vida que esto por delante, el latido renueva la sesión. */
export const RENOVAR_SESION_MS = 45 * 60_000

/** ¿Debe el latido renovar la sesión? `exp` es el claim del JWT, en segundos. */
export function debeRenovarSesion(exp: number | undefined, ahora: number): boolean {
  return typeof exp === 'number' && exp * 1000 - ahora < RENOVAR_SESION_MS
}
