import 'server-only'

// El borde entre una server action y el cliente.
//
// CLAUDE.md lo dice sin matices: una server action SIEMPRE devuelve
// `{ ok: true, data }` o `{ ok: false, error }`, nunca lanza. El motivo no es
// estético. Cuando una action lanza, Next devuelve al navegador una pantalla
// genérica —"This page couldn't load. A server error occurred."— sin causa, sin
// mensaje y sin nada que el usuario pueda contar. El fallo queda invisible
// justo cuando más falta hace verlo, y en producción no hay consola donde
// mirar.
//
// Esa regla se cumplía a mano en cada action, y a mano se incumple: basta un
// `data.id` sobre un `data` que vino null, o un helper que lanza dos capas más
// abajo, para que toda la disciplina de `{ ok }` de esa función no sirva de
// nada. `guarded` la convierte en una garantía del tipo, no en una costumbre.

/**
 * Next señaliza `redirect()` y `notFound()` LANZANDO un error con `digest`.
 * Un catch genérico se los tragaría y la navegación se perdería en silencio,
 * así que hay que re-lanzarlos siempre.
 *
 * Nació duplicado dentro de una action concreta; vive aquí para que cualquiera
 * que envuelva una action lo herede en vez de tener que acordarse.
 */
export function isNextControlFlow(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest
  return typeof d === 'string' && (d.startsWith('NEXT_REDIRECT') || d === 'NEXT_NOT_FOUND')
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Envuelve el cuerpo de una server action para que NADA escape al cliente
 * como excepción.
 *
 * `label` va al log del servidor junto al error completo: en Vercel eso es lo
 * que convierte "falla en producción y no sé por qué" en una línea buscable.
 * El mensaje que ve el usuario lleva el detalle técnico a propósito — estas
 * pantallas las opera el equipo, y un detalle feo es infinitamente mejor que
 * una pantalla en blanco que no dice nada.
 */
export async function guarded<T>(
  label: string,
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn()
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    // El objeto completo, no sólo el mensaje: los errores de PostgREST traen
    // `code`, `details` y `hint`, que es donde suele estar la respuesta.
    console.error(`[action:${label}]`, e)
    const detalle = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `No se pudo completar la operación (${label}): ${detalle}` }
  }
}
