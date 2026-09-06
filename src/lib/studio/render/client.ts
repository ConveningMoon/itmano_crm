import 'server-only'

// El puente hacia /api/studio/render. Existe para que generate.ts NO importe
// Chromium: si lo importara, esos 50 MB acabarían en el bundle de /studio.
//
// La regla del proyecto contra el auto-POST (processSequenceRun) no aplica: allí
// el problema era una carrera de visibilidad de filas en la base. Esta ruta no
// lee nada — recibe HTML y devuelve bytes.

/**
 * A qué host se manda el render.
 *
 * Tiene que ser un host alcanzable SIN Vercel Authentication. Este proyecto
 * tiene la protección en `all_except_custom_domains`, así que todas las URL de
 * despliegue (`*.vercel.app`) piden autenticación y sólo el dominio propio pasa
 * limpio. Apuntar a `VERCEL_URL` —la URL de ESTE despliegue— parece lo correcto
 * y no lo es: la llamada interna se topa con la pantalla de login de Vercel y
 * vuelve con un 401 que no dice nada útil.
 *
 * Por eso manda `VERCEL_PROJECT_PRODUCTION_URL`, que es el dominio propio y lo
 * pone Vercel sin que nadie lo configure. La consecuencia aceptada es que un
 * despliegue de preview renderiza contra el Chrome de producción: no toca datos
 * —la ruta recibe HTML y devuelve bytes, no lee la base—, así que lo único que
 * se pierde es ejercitar el Chrome del propio preview.
 *
 * `NEXT_PUBLIC_APP_URL` queda como override explícito para un alojamiento que
 * no sea Vercel, y localhost para desarrollo.
 */
function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function renderDocument(
  document: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const secret = process.env.STUDIO_RENDER_SECRET
  if (!secret) {
    // El mensaje dice dónde se arregla a propósito: sin la variable el Estudio
    // no genera ni una pieza, y "falta una variable" sin más deja a quien lo lee
    // buscando en qué entorno y con qué valor.
    throw new Error(
      'Falta STUDIO_RENDER_SECRET. Añádela en Vercel → Settings → Environment '
      + 'Variables para Production, Preview y Development (valor: openssl rand -hex 32) '
      + 'y vuelve a desplegar.',
    )
  }

  const destino = `${baseUrl()}/api/studio/render`
  const res = await fetch(destino, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ document, ...opts }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Un 401 con cuerpo HTML casi siempre es Vercel Authentication delante de una
    // URL de despliegue, no un secreto mal puesto. Distinguirlo ahorra una tarde.
    const pista = res.status === 401 && detail.includes('<html')
      ? ' (parece la pantalla de Vercel Authentication: el render debe ir al dominio propio, no a una URL *.vercel.app)'
      : ''
    throw new Error(`El render devolvió ${res.status} desde ${destino}${pista}: ${detail.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
