import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, webSearchCostUsd, computeCostUsd } from '@/lib/services/ai-usage'
import { canGenerateWithAi } from '../source-domains'
import { ensureSourceDomains, pruneSourceDomains } from './source-catalog'
import { researchMarket, parseInaccessibleDomains } from './research'
import { cacheKeyFor, readCachedDossier, writeCachedDossier, type CachedDossier } from './dossier-cache'
import { draftEdition } from './draft'
import { spendOf, type AiSpend } from './spend'
import type { NewsletterContent, NewsletterSource } from '../content'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Orquesta los dos pasos y deja el rastro en el ledger de IA.
//
// Orden deliberado, el mismo de studio/generate.ts: validar → gate de IA →
// investigar → redactar. El gate va ANTES de gastar un solo token.

const MODEL = 'claude-sonnet-5'

// Columnas verificadas contra el esquema real (database.types.ts): `tenants` NO
// tiene `market` ni `brand_voice`. El mercado se deriva de las zonas declaradas
// (migración 087) y la voz sale de `description`, la descripción libre de la
// agencia que se edita en Ajustes → Tu negocio.
// La allowlist NO se lee aquí: sale de `getSourceDomainsFor`, la única puerta
// del repo, ya normalizada. Así la lista que ve el modal y la que llega a la
// herramienta son la misma.
const TENANT_COLUMNS = columns('tenants', [
  'name', 'description', 'primary_areas', 'secondary_areas',
])

export interface GeneratedDraft {
  title:    string
  dek:      string
  content:  NewsletterContent
  sources:  NewsletterSource[]
  dataAsOf: string | null
  /** Trazabilidad: qué se pidió, con qué fuentes y cuánto costó. */
  aiRun: {
    model:    string
    topic:    string | null
    domains:  string[]
    searches: number
    at:       string
    /** true cuando la investigación salió del caché y no se pagó. */
    cached:   boolean
  }
}

export async function generateNewsletterDraft(args: {
  ctx:      TenantContext
  topic:    string | null
  language: string
}): Promise<{ ok: true; data: GeneratedDraft } | { ok: false; error: string }> {
  const { ctx } = args
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant primero.' }

  const db = createAdminClient()
  const { data: tenantRow } = await db
    .from('tenants').select(TENANT_COLUMNS).eq('id', ctx.tenant_id).maybeSingle()

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema, que es lo que el cast podría esconder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = tenantRow as any
  if (!tenant) return { ok: false, error: 'No se pudo leer la configuración de la agencia.' }

  const brandName = String(tenant.name ?? 'la agencia')
  const areas       = Array.isArray(tenant.primary_areas) ? (tenant.primary_areas as string[]) : []
  const secundarias = Array.isArray(tenant.secondary_areas) ? (tenant.secondary_areas as string[]) : []

  // Las fuentes ya no se le piden al cliente: se generan solas la primera vez
  // que genera con IA, a partir de sus zonas y su descripción. Ver
  // source-catalog.ts — el porqué está ahí.
  const { domains } = await ensureSourceDomains(ctx, {
    name:           brandName,
    description:    typeof tenant.description === 'string' ? tenant.description : null,
    areas,
    secondaryAreas: secundarias,
  })
  // Sigue siendo un cierre y no una súplica: sin allowlist no se genera. Pero
  // ahora llegar aquí con la lista vacía es un fallo del sistema, no una tarea
  // pendiente del usuario, y el mensaje lo dice así.
  if (!canGenerateWithAi(domains)) {
    return {
      ok: false,
      error: 'No se pudieron preparar las fuentes de tu mercado. Vuelve a intentarlo en un momento.',
    }
  }

  // El gate de presupuesto, ANTES de gastar nada.
  const blocked = await assertAiWithinLimit(ctx, 'newsletter_research')
  if (blocked) return blocked

  // El "mercado" de la agencia son sus zonas declaradas: es el dato que ya
  // existe y el que de verdad acota la búsqueda.
  const market = [...areas, ...secundarias].join(', ')
  // La descripción libre de la agencia hace de guía de voz: es lo que el propio
  // tenant escribió sobre sí mismo.
  const voice = typeof tenant.description === 'string' && tenant.description.trim()
    ? tenant.description.trim()
    : null

  // Un paso que ya se pagó se registra SIEMPRE, salga bien o mal. Es lo que
  // convierte "lo que Anthropic factura" en "lo que el panel del tenant ve".
  //
  // `costUsdOverride` es obligatorio en la investigación, no un simple paso-por:
  // el costo de esa llamada no es sólo tokens (recordAiUsage lo calcularía con
  // `usage` solo) ni sólo búsquedas (`webSearchCostUsd` solo) — es AMBOS a la
  // vez, y Anthropic cobra los dos.
  const registrar = (
    feature: 'newsletter_research' | 'newsletter_draft',
    spend: AiSpend,
    metadata: Record<string, unknown>,
  ) => {
    const usage = { input_tokens: spend.usage.input, output_tokens: spend.usage.output }
    return recordAiUsage({
      tenantId: ctx.tenant_id,
      userId:   ctx.user_id,
      feature,
      model:    MODEL,
      usage,
      costUsdOverride: computeCostUsd(MODEL, usage) + webSearchCostUsd(spend.searches),
      metadata,
    })
  }

  // ── Paso 1: investigar ────────────────────────────────────────────────────
  //
  // Antes de gastar, mira el caché (newsletter_dossiers, migración 109). Sólo
  // hay llave cuando el tenant escribió un tema: con el tema propuesto por la
  // IA, reutilizar devolvería la misma edición una y otra vez. Ver
  // dossier-cache.ts.
  const cacheKey = cacheKeyFor(args.topic, args.language)
  const cached: CachedDossier | null = cacheKey
    ? await readCachedDossier(ctx.tenant_id, cacheKey, domains)
    : null

  if (cached) {
    // Un acierto NO se registra en el ledger: no hubo llamada a Anthropic ni
    // búsquedas, así que apuntarlo inflaría el gasto del tenant con dinero que
    // nadie cobró. Lo que sí queda es la marca `cached` en `aiRun`.
    const blockedDraftCached = await assertAiWithinLimit(ctx, 'newsletter_draft')
    if (blockedDraftCached) return blockedDraftCached

    let draftFromCache
    try {
      draftFromCache = await draftEdition({
        dossier: { ...cached, searchErrors: [], rawText: '', usage: { input: 0, output: 0 } },
        language: args.language, brandName, voice,
      })
    } catch (e) {
      const spend = spendOf(e)
      if (spend) {
        await registrar('newsletter_draft', spend, { topic: cached.topic, failed: true, cached: true })
      }
      const detalle = e instanceof Error ? e.message : 'error desconocido'
      return { ok: false, error: `No se pudo redactar la edición: ${detalle}` }
    }

    await registrar('newsletter_draft', { usage: draftFromCache.usage, searches: 0 },
      { topic: cached.topic, sources: draftFromCache.sources.length, cached: true })

    return {
      ok: true,
      data: {
        title:    draftFromCache.title,
        dek:      draftFromCache.dek,
        content:  draftFromCache.content,
        sources:  draftFromCache.sources,
        dataAsOf: draftFromCache.dataAsOf,
        aiRun: {
          model:    MODEL,
          topic:    args.topic,
          domains,
          searches: cached.searches,
          at:       new Date().toISOString(),
          cached:   true,
        },
      },
    }
  }

  // `allowed_domains` se valida ANTES de inferir: basta un dominio que bloquee
  // al rastreador de Anthropic para que la llamada entera vuelva con un 400 y
  // sin cobrar. Le pasó a la primera generación real — la lista automática
  // traía prensa que bloquea a los rastreadores de IA, que es lo normal en los
  // grandes diarios.
  //
  // El error nombra los culpables, así que se podan de la allowlist guardada y
  // se reintenta UNA vez. Guardar la lista limpia es lo que hace que el
  // problema se arregle una sola vez y no en cada generación. Y tiene que ser
  // en caliente: qué sitio bloquea al rastreador cambia con el tiempo, así que
  // ninguna lista curada a mano aguanta sola.
  let usable = domains
  let dossier
  let sinFuentesUtiles = false
  try {
    try {
      dossier = await researchMarket({
        topic: args.topic, language: args.language, market, areas, domains: usable, brandName,
      })
    } catch (primero) {
      const bloqueados = parseInaccessibleDomains(primero)
      if (bloqueados.length === 0) throw primero

      usable = await pruneSourceDomains(ctx.tenant_id, bloqueados)
      if (!canGenerateWithAi(usable)) {
        // Se sale por el catch de fuera para no duplicar el registro de gasto;
        // este camino no gastó nada (el 400 se rechaza antes de inferir).
        sinFuentesUtiles = true
        throw primero
      }
      dossier = await researchMarket({
        topic: args.topic, language: args.language, market, areas, domains: usable, brandName,
      })
    }
  } catch (e) {
    if (sinFuentesUtiles) {
      return {
        ok: false,
        error: 'Ninguna de las fuentes de tu mercado admite la búsqueda automática. Escríbenos y te dejamos una lista nueva.',
      }
    }
    // La investigación lanza en dos sitios que están DESPUÉS de la respuesta de
    // la API (sin texto, y fallo de infraestructura de búsqueda): ~187.000
    // tokens de entrada ya cobrados, entre $0,5 y $0,9. Sin esto, ese gasto
    // existía en la factura de ITMANO y no en `ai_usage_events` — el mismo
    // defecto que ya se cerró para el camino de éxito, abierto en el de error.
    const spend = spendOf(e)
    if (spend) {
      await registrar('newsletter_research', spend, {
        searches: spend.searches, domains: domains.length, topic: args.topic, failed: true,
      })
    }
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo investigar el mercado: ${detalle}` }
  }

  // Se registra el costo de la investigación AUNQUE la redacción falle después:
  // esos tokens y esas búsquedas ya se facturaron.
  await registrar(
    'newsletter_research',
    { usage: dossier.usage, searches: dossier.searches },
    { searches: dossier.searches, domains: usable.length, topic: dossier.topic },
  )

  if (dossier.findings.length === 0) {
    return {
      ok: false,
      error: 'La búsqueda no encontró datos respaldables en tus fuentes. Prueba con otro tema o añade más fuentes.',
    }
  }

  // Guardar es best-effort y va DESPUÉS de comprobar que hay hallazgos: un
  // dossier vacío no ahorraría nada y convertiría el próximo intento del mismo
  // tema en el mismo error, sin darle ocasión de buscar de nuevo.
  if (cacheKey) {
    // `usable`, no `domains`: si hubo poda, el dossier salió de la lista corta.
    // Guardar la larga haría que `readCachedDossier` lo descartara siempre por
    // no coincidir la allowlist — un caché que nunca acierta.
    await writeCachedDossier(ctx.tenant_id, cacheKey, usable, {
      topic:    dossier.topic,
      summary:  dossier.summary,
      findings: dossier.findings,
      searches: dossier.searches,
    })
  }

  // El gate otra vez, ANTES del segundo gasto (spec §5: "en cada paso"). La
  // investigación que acaba de correr puede haber sido justo la que agotó el
  // presupuesto del mes; sin esta comprobación la redacción lo pasaría de largo.
  const blockedDraft = await assertAiWithinLimit(ctx, 'newsletter_draft')
  if (blockedDraft) return blockedDraft

  // ── Paso 2: redactar ──────────────────────────────────────────────────────
  let draft
  try {
    draft = await draftEdition({ dossier, language: args.language, brandName, voice })
  } catch (e) {
    // Mismo criterio que arriba: la redacción lanza tres veces con la respuesta
    // ya cobrada (sin bloque tool_use, contenido que no valida, id de fuente
    // inventado). El único fallo gratis es el previo a la llamada.
    const spend = spendOf(e)
    if (spend) {
      await registrar('newsletter_draft', spend, { topic: dossier.topic, failed: true })
    }
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo redactar la edición: ${detalle}` }
  }

  await registrar('newsletter_draft', { usage: draft.usage, searches: 0 },
    { topic: dossier.topic, sources: draft.sources.length })

  return {
    ok: true,
    data: {
      title:    draft.title,
      dek:      draft.dek,
      content:  draft.content,
      sources:  draft.sources,
      dataAsOf: draft.dataAsOf,
      aiRun: {
        model:    MODEL,
        topic:    args.topic,
        domains:  usable,
        searches: dossier.searches,
        at:       new Date().toISOString(),
        cached:   false,
      },
    },
  }
}
