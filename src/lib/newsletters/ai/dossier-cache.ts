import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type { NewsletterDossier, ResearchFinding } from './research'

// Caché del paso de investigación (tabla newsletter_dossiers, migración 109).
//
// Qué problema resuelve: investigar cuesta entre $0,50 y $0,90 por generación
// —lo caro del pipeline con diferencia— y ese gasto se repetía entero cada vez
// que alguien pedía el MISMO tema: publicar la edición en dos idiomas,
// reintentar tras un fallo de redacción, o volver a generar porque el texto no
// convenció. Los datos del mes no cambiaron entre un intento y otro.
//
// La regla que gobierna todo este archivo: SÓLO se cachea cuando el tenant
// escribió un tema. Con el tema propuesto por la IA ("elige tú el más útil"),
// reutilizar el dossier devolvería la misma edición una y otra vez — que es
// exactamente lo contrario de lo que se pide al dejarle elegir. Por eso
// `cacheKeyFor` devuelve null sin tema, y sin llave no hay ni lectura ni
// escritura.

/**
 * Normaliza el tema a una llave estable.
 *
 * "Mercado de Virginia Beach", "  mercado de virginia beach " y "Mercado de
 * Virginia Beach!" son la misma petición: minúsculas, sin acentos, sin
 * puntuación y con los espacios colapsados. Sin esto el caché fallaría en el
 * caso más común —el mismo tema reescrito a mano— que es justo el que tiene
 * que acertar.
 */
export function normalizeTopic(topic: string): string {
  return topic
    .normalize('NFD')
    // Marcas diacríticas: quita el acento y deja la letra base.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ventana de validez: el mes natural en UTC, 'YYYY-MM'.
 *
 * UTC y no la zona del tenant a propósito: el servidor y la base ya razonan en
 * UTC, y un dossier que cambia de periodo según quién pregunte es un caché que
 * acierta a veces. El grano mensual coincide con cómo se publican los datos que
 * cita (informes mensuales de NAR, Redfin, FRED): dentro del mes, volver a
 * buscar devuelve las mismas cifras.
 */
export function periodFor(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface DossierCacheKey {
  topicKey: string
  language: string
  period:   string
}

/**
 * La llave, o null si esta generación NO es cacheable.
 *
 * null en dos casos: sin tema (lo elige la IA) y con un tema que se queda vacío
 * al normalizar (puntuación suelta). Los dos significan lo mismo para el
 * llamador: no leas ni escribas el caché.
 */
export function cacheKeyFor(
  topic: string | null,
  language: string,
  now: Date = new Date(),
): DossierCacheKey | null {
  if (!topic || !topic.trim()) return null
  const topicKey = normalizeTopic(topic)
  if (!topicKey) return null
  return { topicKey, language, period: periodFor(now) }
}

/**
 * ¿Sirve este dossier guardado para la allowlist de hoy?
 *
 * La allowlist NO está en la llave: se compara aquí. Si el tenant añadió o
 * quitó dominios desde que se guardó, el dossier se descarta — reutilizarlo
 * significaría publicar citando dominios que ya no están autorizados, que es
 * justo la garantía que sostiene todo el producto ("verificable"). El orden no
 * cuenta; el conjunto sí.
 */
export function domainsMatch(stored: string[], current: string[]): boolean {
  if (stored.length !== current.length) return false
  const a = [...stored].sort()
  const b = [...current].sort()
  return a.every((v, i) => v === b[i])
}

const DOSSIER_COLUMNS = columns('newsletter_dossiers', [
  'topic', 'summary', 'findings', 'domains', 'searches',
])

/** El dossier cacheado, listo para el paso 2, o null si no hay acierto. */
export type CachedDossier = Omit<NewsletterDossier, 'usage' | 'rawText' | 'searchErrors'>

/**
 * Busca un dossier reutilizable. Best-effort: cualquier fallo devuelve null y
 * la generación sigue por el camino caro. Un caché que rompe la función que
 * acelera no vale lo que ahorra.
 */
export async function readCachedDossier(
  tenantId: string,
  key: DossierCacheKey,
  domains: string[],
): Promise<CachedDossier | null> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('newsletter_dossiers')
      .select(DOSSIER_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('topic_key', key.topicKey)
      .eq('language', key.language)
      .eq('period', key.period)
      .maybeSingle()
    if (!data) return null

    // reason: el cliente de Supabase no está tipado en este repo; columns() ya
    // validó la lista contra el esquema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any
    const stored = Array.isArray(row.domains) ? (row.domains as string[]) : []
    if (!domainsMatch(stored, domains)) return null

    const findings = Array.isArray(row.findings) ? (row.findings as ResearchFinding[]) : []
    // Un dossier sin hallazgos no es un acierto: el orquestador lo rechazaría
    // igual dos líneas más abajo, y devolverlo convertiría un caché vacío en un
    // error para el usuario en vez de en una búsqueda nueva.
    if (findings.length === 0) return null

    return {
      topic:    String(row.topic ?? ''),
      summary:  String(row.summary ?? ''),
      findings,
      searches: Number(row.searches ?? 0),
    }
  } catch {
    return null
  }
}

/**
 * Guarda el dossier recién investigado. Best-effort por el mismo motivo: la
 * edición ya está pagada y producida, y no poder cachearla no es razón para
 * fallar. Un `upsert` sobre el índice único porque dos generaciones simultáneas
 * del mismo tema son perfectamente posibles.
 */
export async function writeCachedDossier(
  tenantId: string,
  key: DossierCacheKey,
  domains: string[],
  dossier: { topic: string; summary: string; findings: ResearchFinding[]; searches: number },
): Promise<void> {
  if (dossier.findings.length === 0) return
  try {
    const db = createAdminClient()
    await db.from('newsletter_dossiers').upsert({
      tenant_id: tenantId,
      topic_key: key.topicKey,
      language:  key.language,
      period:    key.period,
      topic:     dossier.topic,
      summary:   dossier.summary,
      findings:  dossier.findings,
      domains,
      searches:  dossier.searches,
    }, { onConflict: 'tenant_id,topic_key,language,period' })
  } catch {
    // Silencio deliberado: ver arriba.
  }
}
