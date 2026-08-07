'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canAccessCarouselEngine } from '@/lib/access/carousel-engine'
import { recordAiUsage, computeCostUsd, type AiUsageTokens } from '@/lib/services/ai-usage'
import { researchTrends, hasGoogleKey, lastResearchModel } from '@/lib/carousels/gemini'
import { generateCopy } from '@/lib/carousels/copy'
import { getJobWithSlides, getCarouselLogs, type CarouselLogRow } from '@/lib/data/carousels'
import { logCarousel, CAROUSEL_PRICING } from '@/lib/carousels/log'
import { renderOneSlide, drainJob, toBrand, BUCKET } from '@/lib/carousels/render'
import type {
  ActionResult, CarouselBrandProfile, CarouselJobWithSlides, CarouselSlide,
} from '@/lib/carousels/types'

function costFromUsage(usage: AiUsageTokens): number {
  return computeCostUsd('claude-sonnet-5', usage)
}

async function gate() {
  const ctx = await getCurrentTenantContext()
  if (!canAccessCarouselEngine(ctx)) return null
  return ctx
}

// Next señaliza redirect() y notFound() LANZANDO un error con `digest`. Un
// catch genérico se lo tragaría y la navegación se perdería en silencio, así
// que hay que re-lanzarlo siempre.
function isNextControlFlow(e: unknown): boolean {
  const d = (e as { digest?: unknown } | null)?.digest
  return typeof d === 'string' && (d.startsWith('NEXT_REDIRECT') || d === 'NEXT_NOT_FOUND')
}

// ── Editar el perfil de marca (contexto) de un agente ────────────────────────
export async function updateBrandProfile(input: {
  agentId:          string
  display_name:     string
  instagram_handle: string
  agency_name:      string | null
  market:           string | null
  language:         string
  brand_voice:      string | null
  style_prompt:     string | null
}): Promise<ActionResult<CarouselBrandProfile>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }

  const agentId = (input.agentId ?? '').trim()
  const display = (input.display_name ?? '').trim()
  const handle = (input.instagram_handle ?? '').trim()
  if (!agentId) return { ok: false, error: 'Falta el agente' }
  if (!display) return { ok: false, error: 'El nombre no puede estar vacío' }
  if (!handle) return { ok: false, error: 'El @usuario no puede estar vacío' }

  const db = createAdminClient()
  const { data, error } = await db.from('carousel_brand_profiles').update({
    display_name:     display,
    instagram_handle: handle.startsWith('@') ? handle : `@${handle}`,
    agency_name:      (input.agency_name ?? '').trim() || null,
    market:           (input.market ?? '').trim() || null,
    language:         (input.language ?? 'es').trim() || 'es',
    brand_voice:      (input.brand_voice ?? '').trim() || null,
    // vacío → null → el motor cae al prompt de estilo por defecto del código.
    style_prompt:     (input.style_prompt ?? '').trim() || null,
    updated_at:       new Date().toISOString(),
  }).eq('agent_id', agentId).select('*').maybeSingle()

  if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo guardar' }
  revalidatePath('/admin/carousels')
  return { ok: true, data: toBrand(data) }
}

// ── Iniciar un carrusel: investigación (opcional) + copy + filas de slides ────
export async function startCarousel(input: { agentId: string; topic?: string }): Promise<ActionResult<CarouselJobWithSlides>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }

  const agentId = (input.agentId ?? '').trim()
  const topic = (input.topic ?? '').trim() || null
  if (!agentId) return { ok: false, error: 'Falta el agente' }

  // Validar prerequisitos ANTES de crear el job o gastar en ninguna API.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'Falta ANTHROPIC_API_KEY. Configúrala antes de generar carruseles.' }
  }
  // Sin tema manual → hace falta Google para investigar tendencias.
  if (!topic && !hasGoogleKey()) {
    return { ok: false, error: 'Falta GOOGLE_AI_API_KEY para investigar tendencias. Escribe un tema manual o configura la key.' }
  }

  const db = createAdminClient()
  const { data: brandRow } = await db.from('carousel_brand_profiles').select('*').eq('agent_id', agentId).eq('active', true).maybeSingle()
  if (!brandRow) return { ok: false, error: 'Agente no habilitado para el motor de carruseles' }
  const brand = toBrand(brandRow)

  // No repetir: temas + pilares de los últimos carruseles (no fallidos) del agente.
  const { data: recent } = await db.from('carousel_jobs')
    .select('topic, pillar')
    .eq('agent_id', brand.agent_id)
    .neq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10)
  const recentTopics = [...new Set((recent ?? []).map((r: { topic: string | null }) => (r.topic ?? '').trim()).filter(Boolean))].slice(0, 8)
  const recentPillars = [...new Set((recent ?? []).map((r: { pillar: string | null }) => (r.pillar ?? '').trim()).filter(Boolean))].slice(0, 4)

  const { data: jobRow, error: jobErr } = await db.from('carousel_jobs').insert({
    tenant_id: brand.tenant_id,
    agent_id: brand.agent_id,
    topic,
    topic_source: topic ? 'manual' : 'trend_research',
    status: 'pending',
    created_by: ctx.user_id,
  }).select('id').single()
  if (jobErr || !jobRow) return { ok: false, error: 'No se pudo crear el job' }
  const jobId = jobRow.id as string
  await logCarousel({ jobId, step: 'start', message: `Job creado para ${brand.display_name}`, detail: { topic, topic_source: topic ? 'manual' : 'trend_research' } })

  try {
    // 1) Investigación de tendencias (solo si no hay tema manual).
    let research = null
    if (!topic) {
      await db.from('carousel_jobs').update({ status: 'researching', updated_at: new Date().toISOString() }).eq('id', jobId)
      research = await researchTrends(brand, recentTopics)
      await db.from('carousel_jobs').update({ research_json: research, updated_at: new Date().toISOString() }).eq('id', jobId)
      await logCarousel({
        jobId, step: 'research',
        message: research.chosen ? `Tendencia elegida: ${research.chosen.title}` : 'Investigación sin JSON estructurado → Claude elige el tema del texto',
        provider: 'Google Gemini', model: lastResearchModel() ?? undefined, billing: 'estimado', costUsd: CAROUSEL_PRICING.researchEstUsd,
        detail: { trends: research.trends.map((t) => t.title), summary: research.summary, raw_text: research.rawText?.slice(0, 800) },
      })
    }

    // 2) Copy estructurado con Claude.
    await db.from('carousel_jobs').update({ status: 'writing_copy', updated_at: new Date().toISOString() }).eq('id', jobId)
    const { copy, usage } = await generateCopy({ brand, topic, research, recentTopics, recentPillars })
    await recordAiUsage({ tenantId: brand.tenant_id, userId: ctx.user_id, feature: 'carousel_copy', model: 'claude-sonnet-5', usage, metadata: { job_id: jobId } })
    const copyCost = costFromUsage(usage)
    await logCarousel({
      jobId, step: 'copy', message: `Copy generado: ${copy.slides.length} slides · pilar ${copy.pillar}`,
      provider: 'Anthropic', model: 'claude-sonnet-5', billing: 'real', costUsd: copyCost,
      inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0,
      detail: { audience: copy.audience, pillar: copy.pillar, hashtags: copy.hashtags, avoided_topics: recentTopics, recent_pillars: recentPillars },
    })

    // 3) Persistir copy + filas de slides (aún sin imagen).
    await db.from('carousel_jobs').update({
      status: 'generating_images',
      topic: copy.topic || topic,
      audience: copy.audience || research?.chosen?.audience || null,
      pillar: copy.pillar,
      copy_json: copy,
      caption: copy.caption,
      hashtags: copy.hashtags,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    const rows = copy.slides.map((s) => ({
      job_id: jobId,
      slide_number: s.slide_number,
      slide_type: s.slide_type,
      copy_label: s.label,
      copy_title: s.title,
      copy_subtitle: s.subtitle,
      copy_lines: s.lines,
      icon: s.icon,
      image_source: s.image_prompt ? 'nano_banana' : 'procedural',
      image_prompt: s.image_prompt,
      status: 'pending',
    }))
    await db.from('carousel_slides').insert(rows)

    const job = await getJobWithSlides(jobId)
    if (!job) return { ok: false, error: 'No se pudo cargar el job' }

    // El render arranca en el SERVIDOR, no en el navegador. after() corre el
    // drenado cuando la respuesta ya salió, así que la UI recibe el copy al
    // instante y los slides se van componiendo por su cuenta — cerrar la
    // pestaña, perder la red o dormir el equipo ya no deja el carrusel a medias.
    // Lo que no quepa en el maxDuration de esta invocación queda en 'pending' y
    // lo recoge el cron de barrido.
    after(async () => {
      try { await drainJob(jobId) } catch (e) {
        await logCarousel({ jobId, level: 'error', step: 'render', message: `El drenado automático falló: ${e instanceof Error ? e.message : 'error'}` })
      }
    })

    revalidatePath('/admin/carousels')
    return { ok: true, data: job }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    await logCarousel({ jobId, step: 'start', level: 'error', message: `Falló la generación: ${msg}`, detail: { agent_id: agentId, had_topic: !!topic } })
    await db.from('carousel_jobs').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', jobId)
    return { ok: false, error: msg }
  }
}

// ── Eliminar un carrusel (job + slides + assets + historial de costos) ───────
export async function deleteCarousel(jobId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  const id = (jobId ?? '').trim()
  if (!id) return { ok: false, error: 'Falta el id del carrusel' }

  const db = createAdminClient()
  const { data: job } = await db.from('carousel_jobs').select('id, agent_id').eq('id', id).maybeSingle()
  if (!job) return { ok: false, error: 'Carrusel no encontrado' }

  // 1) Borrar los assets del bucket (fondos + PNG renderizados). Best-effort:
  //    si falla, seguimos con el borrado de filas para no dejar el job huérfano.
  try {
    const prefix = `${job.agent_id}/${id}`
    const { data: files } = await db.storage.from(BUCKET).list(prefix)
    if (files && files.length) {
      await db.storage.from(BUCKET).remove(files.map((f: { name: string }) => `${prefix}/${f.name}`))
    }
  } catch (e) {
    console.error(JSON.stringify({ service: 'carousel-delete', step: 'storage', job_id: id, detail: e instanceof Error ? e.message : 'unknown' }))
  }

  // 2) Borrar el historial de costos del copy (ai_usage_events con este job_id).
  await db.from('ai_usage_events').delete().eq('feature', 'carousel_copy').eq('metadata->>job_id', id)

  // 3) Borrar el job — carousel_slides cae por ON DELETE CASCADE.
  const { error } = await db.from('carousel_jobs').delete().eq('id', id)
  if (error) return { ok: false, error: `No se pudo eliminar: ${error.message}` }

  revalidatePath('/admin/carousels')
  return { ok: true, data: { id } }
}

// ── Cargar un job anterior (con sus slides) para la vista ────────────────────
export async function loadCarouselJob(jobId: string): Promise<ActionResult<CarouselJobWithSlides>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  const job = await getJobWithSlides(jobId)
  if (!job) return { ok: false, error: 'Job no encontrado' }
  return { ok: true, data: job }
}

// ── Registro completo del proceso de un carrusel (para diagnóstico en la UI) ──
export async function loadCarouselLogs(jobId: string): Promise<ActionResult<CarouselLogRow[]>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  return { ok: true, data: await getCarouselLogs(jobId) }
}

// ── Registrar un fallo detectado por el navegador ────────────────────────────
// Cuando la invocación de renderSlide muere entera (timeout de la función, 500
// de la plataforma, red caída), su try/catch NUNCA corre: no hay fila en
// carousel_logs y el slide se queda congelado en 'rendering' aunque la pantalla
// muestre "error". Fue exactamente el punto ciego que dejó el incidente del
// 28-07 sin una sola línea de diagnóstico. El cliente, que sí vio el fallo, lo
// reporta aquí para que quede registrado y para reconciliar el estado en la BD.
export async function reportRenderFailure(input: { slideId: string; message: string; attempts?: number }): Promise<ActionResult<null>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }

  const db = createAdminClient()
  const { data: slideRow } = await db.from('carousel_slides').select('job_id, slide_number, status').eq('id', (input.slideId ?? '').trim()).maybeSingle()
  if (!slideRow) return { ok: false, error: 'Slide no encontrado' }

  const msg = (input.message ?? '').slice(0, 500) || 'Error desconocido en el navegador'
  await logCarousel({
    jobId: slideRow.job_id, slideNumber: slideRow.slide_number, level: 'error', step: 'render',
    message: `Slide ${slideRow.slide_number}: la llamada al servidor falló desde el navegador — ${msg}`,
    detail: { origin: 'client', attempts: input.attempts ?? 1, slide_status_en_bd: slideRow.status },
  })

  // La BD decía 'rendering' y la pantalla "error": reconciliamos para que
  // "Renderizar pendientes" y el registro cuenten la misma historia.
  if (slideRow.status === 'rendering') {
    await db.from('carousel_slides')
      .update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() })
      .eq('id', input.slideId)
  }
  return { ok: true, data: null }
}

// ── Renderizar (o regenerar) un slide: imagen + composición ──────────────────
// Capa fina sobre renderOneSlide: valida acceso y delega. La lógica vive en
// src/lib/carousels/render.ts porque el cron de barrido la comparte.
//
// requireClaim va en false a propósito: aquí el usuario pulsó un botón sobre un
// slide concreto y quiere que se rehaga aunque ya estuviera listo. El drenado
// automático sí reclama, para no pisarse con el cron.
export async function renderSlide(slideId: string, opts?: { forceImage?: boolean }): Promise<ActionResult<CarouselSlide>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  return renderOneSlide(slideId, { forceImage: opts?.forceImage === true })
}

// ── Reanudar un carrusel a medias, en el servidor ────────────────────────────
// Sustituye al bucle que hacía el navegador: una sola llamada arranca el
// drenado y este sobrevive a que se cierre la pestaña.
export async function resumeCarousel(jobId: string): Promise<ActionResult<{ started: true }>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  const id = (jobId ?? '').trim()
  if (!id) return { ok: false, error: 'Falta el id del carrusel' }

  after(async () => {
    try { await drainJob(id) } catch (e) {
      await logCarousel({ jobId: id, level: 'error', step: 'render', message: `El drenado manual falló: ${e instanceof Error ? e.message : 'error'}` })
    }
  })
  return { ok: true, data: { started: true } }
}
