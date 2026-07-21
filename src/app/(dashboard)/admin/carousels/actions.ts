'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canAccessCarouselEngine } from '@/lib/access/carousel-engine'
import { recordAiUsage } from '@/lib/services/ai-usage'
import { researchTrends, generateImage, hasGoogleKey } from '@/lib/carousels/gemini'
import { generateCopy } from '@/lib/carousels/copy'
import { composeSlide } from '@/lib/carousels/compositor'
import { getJobWithSlides } from '@/lib/data/carousels'
import type {
  ActionResult, CarouselBrandProfile, CarouselJobWithSlides, CarouselSlide, SlideCopy,
} from '@/lib/carousels/types'

const BUCKET = 'carousel-assets'

async function gate() {
  const ctx = await getCurrentTenantContext()
  if (!canAccessCarouselEngine(ctx)) return null
  return ctx
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

  try {
    // 1) Investigación de tendencias (solo si no hay tema manual).
    let research = null
    if (!topic) {
      await db.from('carousel_jobs').update({ status: 'researching', updated_at: new Date().toISOString() }).eq('id', jobId)
      research = await researchTrends(brand)
      await db.from('carousel_jobs').update({ research_json: research, updated_at: new Date().toISOString() }).eq('id', jobId)
    }

    // 2) Copy estructurado con Claude.
    await db.from('carousel_jobs').update({ status: 'writing_copy', updated_at: new Date().toISOString() }).eq('id', jobId)
    const { copy, usage } = await generateCopy({ brand, topic, research })
    await recordAiUsage({ tenantId: brand.tenant_id, userId: ctx.user_id, feature: 'carousel_copy', model: 'claude-sonnet-5', usage, metadata: { job_id: jobId } })

    // 3) Persistir copy + filas de slides (aún sin imagen).
    await db.from('carousel_jobs').update({
      status: 'generating_images',
      topic: copy.topic || topic,
      audience: copy.audience || research?.chosen?.audience || null,
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
    await db.from('carousel_jobs').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', jobId)
    return { ok: false, error: msg }
  }
}

// ── Cargar un job anterior (con sus slides) para la vista ────────────────────
export async function loadCarouselJob(jobId: string): Promise<ActionResult<CarouselJobWithSlides>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }
  const job = await getJobWithSlides(jobId)
  if (!job) return { ok: false, error: 'Job no encontrado' }
  return { ok: true, data: job }
}

// ── Renderizar (o regenerar) un slide: imagen + composición ──────────────────
export async function renderSlide(slideId: string): Promise<ActionResult<CarouselSlide>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Sin acceso' }

  const db = createAdminClient()
  const { data: slideRow } = await db.from('carousel_slides').select('*').eq('id', slideId).maybeSingle()
  if (!slideRow) return { ok: false, error: 'Slide no encontrado' }
  const { data: jobRow } = await db.from('carousel_jobs').select('*').eq('id', slideRow.job_id).maybeSingle()
  if (!jobRow) return { ok: false, error: 'Job no encontrado' }
  const { data: brandRow } = await db.from('carousel_brand_profiles').select('*').eq('agent_id', jobRow.agent_id).maybeSingle()
  if (!brandRow) return { ok: false, error: 'Perfil de marca no encontrado' }
  const brand = toBrand(brandRow)

  await db.from('carousel_slides').update({ status: 'rendering', error_message: null, updated_at: new Date().toISOString() }).eq('id', slideId)

  try {
    const n = slideRow.slide_number as number
    const base = `${jobRow.agent_id}/${jobRow.id}`

    // Fondo editorial con Nano Banana (solo si el slide lo pide). Si la
    // generación de imagen falla (modelo retirado, cuota, etc.) NO se rompe el
    // slide: cae a fondo procedural para no desperdiciar el copy ya generado.
    // El super_admin puede regenerar ese slide luego para reintentar la imagen.
    let bg: Buffer | null = null
    let imageStoragePath: string | null = slideRow.image_storage_path ?? null
    let imageWarning: string | null = null
    if (slideRow.image_prompt) {
      try {
        bg = await generateImage(slideRow.image_prompt as string)
        imageStoragePath = await uploadPng(`${base}/bg-${n}.png`, bg)
      } catch (imgErr) {
        bg = null
        imageWarning = imgErr instanceof Error ? imgErr.message : 'No se pudo generar la imagen'
        console.error(JSON.stringify({ service: 'carousel-image', slide_id: slideId, detail: imageWarning }))
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

    // Estado del job: ready si todos los slides están listos.
    const { data: siblings } = await db.from('carousel_slides').select('status').eq('job_id', jobRow.id)
    const allReady = (siblings ?? []).every((s: { status: string }) => s.status === 'ready')
    await db.from('carousel_jobs').update({ status: allReady ? 'ready' : 'composing', updated_at: new Date().toISOString() }).eq('id', jobRow.id)

    revalidatePath('/admin/carousels')
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
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    await db.from('carousel_slides').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', slideId)
    return { ok: false, error: msg }
  }
}
