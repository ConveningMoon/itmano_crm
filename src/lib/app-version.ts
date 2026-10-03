// "Hay una versión nueva del CRM": estado compartido en el navegador y las dos
// reglas puras que lo usan. Sin dependencias de React ni de Next para poder
// probarlas en Node.
//
// Por qué hace falta: con Skew Protection (Vercel Pro), quien tiene el CRM
// abierto sigue hablando con SU versión hasta que recarga, así que sus acciones
// no fallan tras un deploy — pero tampoco ve los cambios. NewVersionNotice
// detecta el deploy nuevo, avisa, y a partir de ahí la siguiente navegación
// carga la página completa: la versión nueva entra sola en un momento en el
// que el usuario ya está saliendo de la página y no pierde nada escrito.

let versionNueva = false

/** Lo llama NewVersionNotice al detectar un deploy distinto del propio. */
export function marcarVersionNueva(): void {
  versionNueva = true
}

/** true desde que se detectó un deploy nuevo; las navegaciones pasan a ser completas. */
export function hayVersionNueva(): boolean {
  return versionNueva
}

/**
 * ¿La versión que sirve ahora producción es otra que la de esta pestaña?
 * Sólo cuenta una respuesta válida: un fallo de red o un cuerpo raro nunca
 * debe disparar el aviso.
 */
export function esVersionDistinta(propia: string, servidor: unknown): boolean {
  return typeof servidor === 'string' && servidor.length > 0 && servidor !== propia
}

interface Clic {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

interface Enlace {
  href: string
  target: string
  download: boolean
}

/**
 * ¿Este clic es una navegación interna normal que el router de Next haría en
 * cliente? Sólo esas se convierten en carga completa. Todo lo demás se deja
 * pasar tal cual: abrir en pestaña nueva (modificadores o target), descargas,
 * enlaces a otro origen y saltos a un ancla de la misma página, que no deben
 * recargar nada.
 */
export function esNavegacionInterna(clic: Clic, enlace: Enlace, actual: string): boolean {
  if (clic.defaultPrevented || clic.button !== 0) return false
  if (clic.metaKey || clic.ctrlKey || clic.shiftKey || clic.altKey) return false
  if (enlace.download) return false
  if (enlace.target && enlace.target !== '_self') return false

  let destino: URL
  let origen: URL
  try {
    destino = new URL(enlace.href, actual)
    origen = new URL(actual)
  } catch {
    return false
  }
  if (destino.origin !== origen.origin) return false
  if (destino.protocol !== 'http:' && destino.protocol !== 'https:') return false

  const mismaPagina = destino.pathname === origen.pathname && destino.search === origen.search
  if (mismaPagina && destino.hash !== '') return false

  return true
}
