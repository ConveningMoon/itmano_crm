// La allowlist de fuentes de un tenant: los dominios que la búsqueda web puede
// consultar al generar una newsletter.
//
// Es lo que hace el sistema verificable POR CONSTRUCCIÓN y no por instrucción:
// un dato que no esté en estas fuentes no se encuentra, así que no se puede
// citar. Un prompt que pida "usa fuentes fiables" es una súplica; esto es un
// cierre.
//
// Puro y client-safe: el modal lo usa para avisar ANTES de gastar, y el
// servidor para no mandar a la API una lista que va a rechazar igualmente.

/** Tope de la herramienta `web_search`: de 1 a 64 hostnames. */
export const MAX_SOURCE_DOMAINS = 64

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * Deja un hostname como lo quiere la herramienta, o null si no sirve.
 *
 * Acepta que el usuario pegue una URL entera —es lo que hace cualquiera— y se
 * queda con el host. Rechaza exactamente lo que rechaza la API: IPs, TLD
 * desnudos y nombres de una sola etiqueta como `localhost`.
 */
export function normalizeDomain(raw: string): string | null {
  let v = raw.trim().toLowerCase()
  if (!v) return null

  // Si pegaron una URL, quedarse con el host.
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  v = v.split('/')[0]
  v = v.split('?')[0]
  v = v.split('#')[0]
  v = v.replace(/:\d+$/, '')   // puerto
  v = v.replace(/\.$/, '')     // punto final del FQDN

  if (!v) return null
  if (IPV4.test(v)) return null
  if (!v.includes('.')) return null          // una sola etiqueta
  if (!/^[a-z0-9.-]+$/.test(v)) return null
  if (v.startsWith('.') || v.includes('..')) return null

  // Cada etiqueta debe tener contenido y la última (el TLD) ser alfabética.
  const labels = v.split('.')
  if (labels.some(l => l.length === 0)) return null
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) return null

  return v
}

/** Normaliza una lista, deduplica conservando el orden, y trunca al tope. */
export function parseSourceDomains(raw: unknown): { domains: string[]; rejected: string[] } {
  if (!Array.isArray(raw)) return { domains: [], rejected: [] }

  const domains: string[] = []
  const rejected: string[] = []
  const vistos = new Set<string>()

  for (const item of raw) {
    if (typeof item !== 'string') continue
    const norm = normalizeDomain(item)
    if (!norm) {
      if (item.trim()) rejected.push(item.trim())
      continue
    }
    if (vistos.has(norm)) continue
    vistos.add(norm)
    domains.push(norm)
  }

  return { domains: domains.slice(0, MAX_SOURCE_DOMAINS), rejected }
}

/**
 * Sin fuentes declaradas NO se genera.
 *
 * Deliberado: generar sin allowlist significaría buscar en toda la web, que es
 * justo lo que este diseño existe para impedir. Es preferible un botón
 * deshabilitado con su motivo que una newsletter citando un blog cualquiera.
 */
export function canGenerateWithAi(domains: string[] | null): boolean {
  return Array.isArray(domains) && domains.length > 0
}

/**
 * ¿Esta URL pertenece a la allowlist?
 *
 * `allowed_domains` cierra la BÚSQUEDA, pero el dossier que devuelve el modelo
 * es texto libre: la URL de cada hallazgo la escribe él. Y `topic` es texto
 * libre del tenant que entra literal al prompt, así que un tema redactado a
 * propósito puede inducir a citar un dominio ajeno que acabaría publicado en la
 * página pública bajo la marca del cliente. Esto vuelve a cerrar la ESCRITURA
 * con el mismo criterio con el que estaba cerrada la búsqueda.
 *
 * La coincidencia es por sufijo CON PUNTO: `nar.realtor` acepta
 * `www.nar.realtor` y rechaza `evil-nar.realtor`. Un `endsWith` desnudo dejaría
 * pasar el segundo, que es exactamente el ataque.
 */
export function urlIsAllowed(url: string, domains: string[]): boolean {
  if (typeof url !== 'string' || !Array.isArray(domains) || domains.length === 0) return false

  let host: string
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return false
  }
  if (!host) return false

  return domains.some(d => {
    if (typeof d !== 'string') return false
    const dominio = d.trim().toLowerCase().replace(/\.$/, '')
    if (!dominio) return false
    return host === dominio || host.endsWith(`.${dominio}`)
  })
}
