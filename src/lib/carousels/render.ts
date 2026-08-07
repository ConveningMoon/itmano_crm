import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateImage } from './gemini'
import { composeSlide } from './compositor'
import { logCarousel, CAROUSEL_PRICING } from './log'
import type { ActionResult, CarouselBrandProfile, CarouselSlide, SlideCopy } from './types'

// ── Núcleo de renderizado, fuera de las server actions ───────────────────────
// Vive aquí y no en actions.ts porque lo llaman DOS entradas distintas: la
// server action (botones manuales) y el cron de barrido. Un archivo 'use server'
// no puede exportar helpers — cada export se vuelve un endpoint HTTP —, así que
// la lógica compartida tiene que estar en un módulo server-only normal.

export const BUCKET = 'carousel-assets'

// Un slide 'rendering' cuya invocación murió quedaría bloqueado para siempre.
// Pasado este margen se considera abandonado y se puede volver a reclamar.
const STALE_RENDERING_MS = 10 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toBrand(r: any): CarouselBrandProfile {
  return {
    agent_id: r.agent_id, tenant_id: r.tenant_id, display_name: r.display_name,
    instagram_handle: r.instagram_handle, agency_name: r.agency_name ?? null,
    market: r.market ?? null, language: r.language, brand_voice: r.brand_voice ?? null,
    style_prompt: r.style_prompt ?? null, active: r.active,
  }
}

export async function uploadPng(path: string, png: Buffer): Promise<string> {
  const db = createAdminClient()
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`Storage: ${error.message}`)
  return path
}

// Reclama el slide de forma ATÓMICA: el UPDATE solo toca la fila si sigue
// disponible, y Postgres serializa las escrituras concurrentes sobre ella. Si
// devuelve 0 filas, otro proceso ya lo tomó y este debe apartarse.
//
// Sin esto, el barrido del cron y el drenado en segundo plano podrían renderizar
// el mismo slide a la vez — y en los slides con foto eso significa PAGAR la
// imagen dos veces.
// Se hace en dos UPDATE en vez de uno con .or(...) a propósito: el filtro or de
// PostgREST parte el valor por puntos, y un timestamp ISO lleva '.' y ':', así
// que la variante "lista" es frágil de parsear. Cada UPDATE por separado es
// igual de atómico y no depende de cómo se escapen los valores.
async function claimSlide(slideId: string): Promise<boolean> {
  const db = createAdminClient()
  const now = new Date().toISOString()
  const patch = { status: 'rendering', error_message: null, updated_at: now }

  // 1) Caso normal: el slide está libre.
  const { data: fresh } = await db.from('carousel_slides')
    .update(patch).eq('id', slideId).in('status', ['pending', 'failed']).select('id')
  if ((fresh?.length ?? 0) > 0) return true

  // 2) Colgado en 'rendering' desde hace rato: la invocación que lo tomó murió.
  const staleBefore = new Date(Date.now() - STALE_RENDERING_MS).toISOString()
  const { data: stale } = await db.from('carousel_slides')
    .update(patch).eq('id', slideId).eq('status', 'rendering').lt('updated_at', staleBefore).select('id')
  return (stale?.length ?? 0) > 0
}

export interface RenderOpts {
  // Genera una imagen NUEVA (paga) en vez de reutilizar la del bucket.
  forceImage?: boolean
  // true  → solo renderiza si consigue reclamar el slide (drenado automático).
  // false → renderiza siempre (botón manual: el usuario lo pidió explícitamente).
  requireClaim?: boolean
}

// Renderiza UN slide: fondo (reutilizado o nuevo) + composición + subida.
// Devuelve ActionResult para que la server action lo reenvíe tal cual.
export async function renderOneSlide(slideId: string, opts: RenderOpts = {}): Promise<ActionResult<CarouselSlide>> {
  const forceImage = opts.forceImage === true
  const db = createAdminClient()

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

    if (opts.requireClaim) {
      if (!await claimSlide(slideId)) return { ok: false, error: 'Otro proceso ya está renderizando este slide' }
    } else {
      const { error: markErr } = await db.from('carousel_slides')
        .update({ status: 'rendering', error_message: null, updated_at: new Date().toISOString() })
        .eq('id', slideId)
      if (markErr) throw new Error(`No se pudo marcar el slide como "componiendo": ${markErr.message}`)
    }

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
          await logCarousel({ jobId: jobRow.id, slideNumber: n, level: 'warn', step: 'image', message: `No se pudo reutilizar la imagen del slide ${n}, se regenerará: ${dlErr instanceof Error ? dlErr.message : 'error'}` })
        }
      }
      // 2) GENERAR imagen nueva (paga) si se fuerza, no había, o falló la reutilización.
      if (!bg) {
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
      image_source: bg ? 'nano_banana' : 'procedural',
      image_storage_path: imageStoragePath,
      rendered_storage_path: renderedPath,
      // Nota (no error): imagen no generada → fondo procedural. status sigue ready.
      error_message: imageWarning ? `Fondo procedural: ${imageWarning}` : null,
      updated_at: new Date().toISOString(),
    }).eq('id', slideId)

    await logCarousel({ jobId: jobRow.id, slideNumber: n, step: 'render', message: `Slide ${n} listo (${bg ? 'con foto' : 'procedural'})` })

    await refreshJobStatus(jobRow.id)

    const { data: fresh } = await db.from('carousel_slides').select('*').eq('id', slideId).single()
    const url = db.storage.from(BUCKET).getPublicUrl(renderedPath).data.publicUrl
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
    if (jobId) {
      await logCarousel({
        jobId, slideNumber: n, level: 'error', step: 'render',
        message: `Slide ${n ?? '?'} falló: ${msg}`,
        detail: { had_image_prompt: hadImagePrompt, forced_image: forceImage, stack: e instanceof Error ? e.stack?.slice(0, 600) : null },
      })
    } else {
      console.error(JSON.stringify({ service: 'carousel', level: 'error', step: 'render', slide_id: slideId, message: msg }))
    }
    try {
      await db.from('carousel_slides').update({ status: 'failed', error_message: msg, updated_at: new Date().toISOString() }).eq('id', slideId)
    } catch { /* el registro de arriba ya dejó constancia */ }
    if (jobId) await refreshJobStatus(jobId).catch(() => {})
    return { ok: false, error: msg }
  }
}

// El estado del job se deriva de sus slides — nunca se escribe "a mano".
export async function refreshJobStatus(jobId: string): Promise<void> {
  const db = createAdminClient()
  const { data: siblings } = await db.from('carousel_slides').select('status').eq('job_id', jobId)
  const rows = siblings ?? []
  if (rows.length === 0) return
  const allReady = rows.every((s: { status: string }) => s.status === 'ready')
  const anyLeft = rows.some((s: { status: string }) => s.status === 'pending' || s.status === 'rendering')
  await db.from('carousel_jobs')
    .update({ status: allReady ? 'ready' : anyLeft ? 'composing' : 'failed', updated_at: new Date().toISOString() })
    .eq('id', jobId)
}

export interface DrainResult { rendered: number; failed: number; skipped: number; exhausted: boolean }

interface Candidate { id: string; slide_number: number; image_prompt: string | null; image_storage_path: string | null; status: string; updated_at: string }

// Cuántas imágenes se piden a la vez. Un carrusel tiene exactamente 3 slides
// con foto, así que 3 cubre el caso normal de una sola tanda sin pasarse con
// los límites por minuto del free tier de Google.
const IMAGE_CONCURRENCY = 3

// Genera la imagen de un slide y la deja subida y apuntada en su fila. Después
// renderOneSlide la encuentra en el bucket y la REUTILIZA (gratis), que es la
// misma ruta que ya existía para reanudar — por eso paralelizar no puede
// duplicar cobros: quien paga es esta función, y solo sobre slides reclamados.
async function prefetchImage(s: Candidate, jobId: string, agentId: string): Promise<void> {
  const db = createAdminClient()
  const n = s.slide_number
  await logCarousel({ jobId, slideNumber: n, step: 'image', message: `Solicitando imagen a Nano Banana (slide ${n})…` })
  try {
    const img = await generateImage(s.image_prompt as string)
    // Ledger antes de subir: una imagen facturada nunca queda sin contabilizar.
    await logCarousel({
      jobId, slideNumber: n, step: 'image', message: `Imagen generada (slide ${n})`,
      provider: 'Google Nano Banana', model: img.model, billing: 'estimado', costUsd: CAROUSEL_PRICING.imageEstUsd,
    })
    const path = await uploadPng(`${agentId}/${jobId}/bg-${n}.png`, img.data)
    await db.from('carousel_slides').update({ image_storage_path: path }).eq('id', s.id)
  } catch (e) {
    // No es fatal: renderOneSlide intentará generarla en línea y, si tampoco
    // puede, el slide sale con fondo procedural. Aquí solo dejamos el rastro.
    await logCarousel({
      jobId, slideNumber: n, level: 'warn', step: 'image',
      message: `La imagen adelantada del slide ${n} falló: ${e instanceof Error ? e.message : 'error'}`,
    })
  }
}

// Drena los slides que falten de un carrusel dentro de un presupuesto de tiempo.
//
// Dos fases, y la separación es el porqué de todo esto:
//   1. IMÁGENES, en paralelo. Generar una imagen es esperar a Google — no gasta
//      CPU nuestra. En serie, tres imágenes eran ~60 s y el carrusel entero no
//      cabía en una sola invocación; a la vez son ~20 s y sí cabe.
//   2. COMPOSICIÓN, en serie. sharp sí es CPU y memoria: hacerlo en paralelo no
//      acelera nada (se pelean por el mismo core) y multiplica el pico de
//      memoria de la función, que es justo como se muere una invocación.
//
// Los slides se reclaman ANTES de pedir sus imágenes. Sin eso, dos drenados
// simultáneos pedirían —y pagarían— las mismas imágenes en paralelo.
export async function drainJob(jobId: string, opts: { budgetMs?: number } = {}): Promise<DrainResult> {
  const budgetMs = opts.budgetMs ?? 90_000
  const startedAt = Date.now()
  const db = createAdminClient()
  const out: DrainResult = { rendered: 0, failed: 0, skipped: 0, exhausted: false }

  const { data: jobRow } = await db.from('carousel_jobs').select('id, agent_id').eq('id', jobId).maybeSingle()
  if (!jobRow) return out

  const staleBefore = Date.now() - STALE_RENDERING_MS
  const { data: rows } = await db.from('carousel_slides')
    .select('id, slide_number, image_prompt, image_storage_path, status, updated_at')
    .eq('job_id', jobId)
    .in('status', ['pending', 'failed', 'rendering'])
    .order('slide_number', { ascending: true })

  // Un 'rendering' reciente lo está haciendo otro proceso ahora mismo: se deja
  // en paz. El claim volverá a comprobarlo de todos modos, esto solo evita
  // intentos inútiles. El filtro va en JS por lo dicho arriba sobre .or().
  const candidates = (rows ?? []).filter((s: Candidate) =>
    s.status !== 'rendering' || new Date(s.updated_at).getTime() < staleBefore) as Candidate[]

  // ── Fase 0: reclamar lo que quepa en el presupuesto ───────────────────────
  // Se estima con las imágenes ya en paralelo: una sola tanda de ~25 s más el
  // coste de componer cada slide.
  const claimed: Candidate[] = []
  for (const s of candidates) {
    const needsImage = !!s.image_prompt && !s.image_storage_path
    const batches = Math.ceil((claimed.filter((c) => c.image_prompt && !c.image_storage_path).length + (needsImage ? 1 : 0)) / IMAGE_CONCURRENCY)
    const planned = batches * 25_000 + (claimed.length + 1) * 8_000
    if (planned > budgetMs) { out.exhausted = true; break }
    if (await claimSlide(s.id)) claimed.push(s)
    else out.skipped++
  }

  // ── Fase 1: imágenes en paralelo ──────────────────────────────────────────
  const needImages = claimed.filter((s) => s.image_prompt && !s.image_storage_path)
  for (let i = 0; i < needImages.length; i += IMAGE_CONCURRENCY) {
    const batch = needImages.slice(i, i + IMAGE_CONCURRENCY)
    // allSettled: una imagen caída no debe tumbar a las demás de la tanda.
    await Promise.allSettled(batch.map((s) => prefetchImage(s, jobId, jobRow.agent_id as string)))
  }

  // ── Fase 2: composición en serie ──────────────────────────────────────────
  for (const s of claimed) {
    if (Date.now() - startedAt + 8_000 > budgetMs) {
      // Sin tiempo para este: se devuelve a 'pending' en vez de dejarlo
      // reclamado, o quedaría bloqueado 10 minutos para la siguiente pasada.
      await db.from('carousel_slides')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', s.id).eq('status', 'rendering')
      out.exhausted = true
      continue
    }
    // requireClaim en false: ya es nuestro de la fase 0.
    const r = await renderOneSlide(s.id, { requireClaim: false })
    if (r.ok) out.rendered++
    else out.failed++
  }

  await refreshJobStatus(jobId)
  return out
}
