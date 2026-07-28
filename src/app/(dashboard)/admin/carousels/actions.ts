'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canAccessCarouselEngine } from '@/lib/access/carousel-engine'
import { recordAiUsage, computeCostUsd, type AiUsageTokens } from '@/lib/services/ai-usage'
import { researchTrends, generateImage, hasGoogleKey, lastResearchModel } from '@/lib/carousels/gemini'
import { generateCopy } from '@/lib/carousels/copy'
import { composeSlide } from '@/lib/carousels/compositor'
import { getJobWithSlides, getCarouselLogs, type CarouselLogRow } from '@/lib/data/carousels'
import { logCarousel, CAROUSEL_PRICING } from '@/lib/carousels/log'
import type {
  ActionResult, CarouselBrandProfile, CarouselJobWithSlides, CarouselSlide, SlideCopy,
} from '@/lib/carousels/types'

const BUCKET = 'carousel-assets'

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBrand(r: any): CarouselBrandProfile {
  return {
    agent_id: r.agent_id, tenant_id: r.tenant_id, display_name: r.display_name,
    instagram_handle: r.instagram_handle, agency_name: r.agency_name ?? null,
    market: r.market ?? null, language: r.language, brand_voice: r.brand_voice ?? null,
    style_prompt: r.style_prompt ?? null, active: r.active,
  }
}

async function uploadPng(path: string, png: Buffer): Promise<string> {
  const db = createAdminClient()
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`Storage: ${error.message}`)
  return path
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
    revalidatePath('/admin/carousels')
    return { ok: true, data: job }
  } catch (e) {
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
// forceImage=true → genera una imagen NUEVA (paga). Por defecto (false) se
// REUTILIZA la imagen ya generada si existe (reanudar/recomponer no re-paga).
export async function renderSlide(slideId: string, opts?: { forceImage?: boolean }): Promise<ActionResult<CarouselSlide>> {
  // gate() queda FUERA del try: getCurrentTenantContext puede hacer redirect()
  // a /login y ese "error" de control de flujo debe propagarse, no loguearse.
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  const forceImage = opts?.forceImage === true

  const db = createAdminClient()

  // El resto del preámbulo (las tres lecturas y el marcado 'rendering') vivía
  // fuera del try. Cualquier fallo ahí — pooler saturado, lectura caída — se
  // propagaba SIN escribir en carousel_logs y dejando el slide colgado en
  // 'rendering': error visible en pantalla, cero rastro para diagnosticarlo.
  // Ahora todo está cubierto y cada salida deja registro.
  let jobId: string | null = null
  let n: number | null = null
  let hadImagePrompt = false

  try {
    const { data: slideRow, error: slideErr } = await db.from('carousel_slides').select('*').eq('id', slideId).maybeSingle()
    if (slideErr) throw new Error(`No se pudo leer el slide: ${slideErr.message}`)
    if (!slideRow) return { ok: false, error: 'Slide no encontrado' }
    jobId = slideRow.job_id as string
    n = slideRow.slide_number as number
    hadImagePrompt = !!slideRow.image_prompt

    const { data: jobRow, error: jobErr } = await db.from('carousel_jobs').select('*').eq('id', slideRow.job_id).maybeSingle()
    if (jobErr) throw new Error(`No se pudo leer el carrusel: ${jobErr.message}`)
    if (!jobRow) return { ok: false, error: 'Job no encontrado' }

    const { data: brandRow, error: brandErr } = await db.from('carousel_brand_profiles').select('*').eq('agent_id', jobRow.agent_id).maybeSingle()
    if (brandErr) throw new Error(`No se pudo leer el perfil de marca: ${brandErr.message}`)
    if (!brandRow) return { ok: false, error: 'Perfil de marca no encontrado' }
    const brand = toBrand(brandRow)

    const { error: markErr } = await db.from('carousel_slides')
      .update({ status: 'rendering', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', slideId)
    if (markErr) throw new Error(`No se pudo marcar el slide como "componiendo": ${markErr.message}`)

    const base = `${jobRow.agent_id}/${jobRow.id}`

    // Fondo editorial con Nano Banana (solo si el slide lo pide).
    let bg: Buffer | null = null
    let imageStoragePath: string | null = slideRow.image_storage_path ?? null
    let imageWarning: string | null = null
    if (slideRow.image_prompt) {
      const hasExisting = !!slideRow.image_storage_path
      // 1) REUTILIZAR la imagen existente (sin pagar) al reanudar/recomponer.
      if (hasExisting && !forceImage) {
        try {
          const { data: blob } = await db.storage.from(BUCKET).download(slideRow.image_storage_path as string)
          if (!blob) throw new Error('descarga vacía')
          bg = Buffer.from(await blob.arrayBuffer())
          await logCarousel({ jobId: jobRow.id, slideNumber: n, step: 'image', message: `Reutilizó la imagen existente del slide ${n} (sin costo)` })
        } catch (dlErr) {
          // Si no se pudo descargar, generamos de nuevo (fallback).
          await logCarousel({ jobId: jobRow.id, slideNumber: n, level: 'warn', step: 'image', message: `No se pudo reutilizar la imagen del slide ${n}, se regenerará: ${dlErr instanceof Error ? dlErr.message : 'error'}` })
        }
      }
      // 2) GENERAR imagen nueva (paga) si se fuerza, no había, o falló la reutilización.
      if (!bg) {
        // Breadcrumb ANTES de la llamada cara: si la función muriera aquí,
        // queda rastro de que se intentó (aunque el timeout de fetch lo evita).
        await logCarousel({ jobId: jobRow.id, slideNumber: n, step: 'image', message: `Solicitando imagen a Nano Banana (slide ${n})…` })
        try {
          const img = await generateImage(slideRow.image_prompt as string)
          // Ledger: se registra EN CUANTO llega la imagen (antes de subir), así
          // una imagen facturada NUNCA queda sin contabilizar aunque falle el paso siguiente.
          await logCarousel({
            jobId: jobRow.id, slideNumber: n, step: 'image', message: `Imagen generada (slide ${n})`,
            provider: 'Google Nano Banana', model: img.model, billing: 'estimado', costUsd: CAROUSEL_PRICING.imageEstUsd,
          })
          bg = img.data
          imageStoragePath = await uploadPng(`${base}/bg-${n}.png`, img.data)
        } catch (imgErr) {
          bg = null
          imageWarning = imgErr instanceof Error ? imgErr.message : 'No se pudo generar la imagen'
          await logCarousel({
            jobId: jobRow.id, slideNumber: n, level: 'warn', step: 'image',
            message: `Imagen falló → fondo procedural: ${imageWarning}`,
            detail: { image_prompt: (slideRow.image_prompt as string)?.slice(0, 200) },
          })
        }
      }
    }

    const slideCopy: SlideCopy = {
      slide_number: n,
      slide_type: slideRow.slide_type ?? 'text',
      label: slideRow.copy_label ?? null,
      title: slideRow.copy_title ?? null,
      subtitle: slideRow.copy_subtitle ?? null,
      lines: slideRow.copy_lines ?? null,
      icon: slideRow.icon ?? null,
      image_prompt: slideRow.image_prompt ?? null,
    }

    const png = await composeSlide(slideCopy, brand, bg)
    const renderedPath = await uploadPng(`${base}/slide-${n}.png`, png)

    await db.from('carousel_slides').update({
      status: 'ready',
      // Si el slide pedía imagen pero falló, quedó con fondo procedural.
      image_source: bg ? 'nano_banana' : 'procedural',
      image_storage_path: imageStoragePath,
      rendered_storage_path: renderedPath,
      // Nota (no error): imagen no generada → fondo procedural. status sigue ready.
      error_message: imageWarning ? `Fondo procedural: ${imageWarning}` : null,
      updated_at: new Date().toISOString(),
    }).eq('id', slideId)

    await logCarousel({ jobId: jobRow.id, slideNumber: n, step: 'render', message: `Slide ${n} listo (${bg ? 'con foto' : 'procedural'})` })

    // Estado del job: ready si todos los slides están listos.
    const { data: siblings } = await db.from('carousel_slides').select('status').eq('job_id', jobRow.id)
    const allReady = (siblings ?? []).every((s: { status: string }) => s.status === 'ready')
    await db.from('carousel_jobs').update({ status: allReady ? 'ready' : 'composing', updated_at: new Date().toISOString() }).eq('id', jobRow.id)

    // Sin revalidatePath aquí a propósito. Se llamaba una vez POR SLIDE, y cada
    // llamada obliga a Next a re-renderizar la página entera del motor
    // (getBrandProfiles + getRecentJobs + getCarouselCosts + getJobWithSlides)
    // y a devolver ese payload junto con la respuesta — dentro de la MISMA
    // invocación que acaba de componer un PNG con sharp. Ocho slides eran ocho
    // re-renderizados completos de la página, con sus decenas de consultas, sin
    // que el cliente los usara: la UI ya aplica el slide devuelto con patchSlide.
    // Era el mayor consumo de tiempo y de conexiones del render, y puro
    // desperdicio. La caché de la ruta se refresca en startCarousel/deleteCarousel.
    const { data: fresh } = await db.from('carousel_slides').select('*').eq('id', slideId).single()
    const url = createAdminClient().storage.from(BUCKET).getPublicUrl(renderedPath).data.publicUrl
    return {
      ok: true,
      data: {
        id: fresh.id, job_id: fresh.job_id, slide_number: fresh.slide_number, slide_type: fresh.slide_type,
        copy_label: fresh.copy_label, copy_title: fresh.copy_title, copy_subtitle: fresh.copy_subtitle,
        copy_lines: fresh.copy_lines, icon: fresh.icon, image_source: fresh.image_source,
        image_prompt: fresh.image_prompt, image_storage_path: fresh.image_storage_path,
        rendered_storage_path: fresh.rendered_storage_path, rendered_url: url, status: fresh.status,
        error_message: fresh.error_message,
      },
    }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    // jobId es null solo si ni siquiera se pudo leer la fila del slide; en ese
    // caso no hay carrusel al que asociar el registro y queda el console.error.
    if (jobId) {
      await logCarousel({
        jobId, slideNumber: n, level: 'error', step: 'render',
        message: `Slide ${n ?? '?'} falló: ${msg}`,
        detail: { had_image_prompt: hadImagePrompt, forced_image: forceImage, stack: e instanceof Error ? e.stack?.slice(0, 600) : null },
      })
    } else {
      console.error(JSON.stringify({ service: 'carousel', level: 'error', step: 'render', slide_id: slideId, message: msg }))
    }
    // Best-effort: si esta escritura también falla, no queremos perder el error
    // real de arriba tapándolo con el de la escritura.
    try {
      await db.from('carousel_slides').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', slideId)
    } catch { /* el registro de arriba ya dejó constancia */ }
    return { ok: false, error: msg }
  }
}
