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
