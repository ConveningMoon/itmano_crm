import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canAccessCarouselEngine } from '@/lib/access/carousel-engine'
import type {
  CarouselBrandProfile, CarouselJob, CarouselJobWithSlides, CarouselSlide,
} from '@/lib/carousels/types'

// Data-layer del Carousel Engine (solo super_admin). Todas las funciones
// verifican el acceso y leen con el admin client (las tablas tienen RLS
// select-only para super_admin; las escrituras van por las server actions).

const BUCKET = 'carousel-assets'

async function assertAccess() {
  const ctx = await getCurrentTenantContext()
  if (!canAccessCarouselEngine(ctx)) throw new Error('forbidden')
  return ctx
}

function publicUrl(path: string | null): string | null {
  if (!path) return null
  const db = createAdminClient()
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSlide(r: any): CarouselSlide {
  return {
    id: r.id,
    job_id: r.job_id,
    slide_number: r.slide_number,
    slide_type: r.slide_type ?? null,
    copy_label: r.copy_label ?? null,
    copy_title: r.copy_title ?? null,
    copy_subtitle: r.copy_subtitle ?? null,
    copy_lines: r.copy_lines ?? null,
    icon: r.icon ?? null,
    image_source: r.image_source ?? null,
    image_prompt: r.image_prompt ?? null,
    image_storage_path: r.image_storage_path ?? null,
    rendered_storage_path: r.rendered_storage_path ?? null,
    rendered_url: publicUrl(r.rendered_storage_path ?? null),
    status: r.status,
    error_message: r.error_message ?? null,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJob(r: any): CarouselJob {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    agent_id: r.agent_id,
    topic: r.topic ?? null,
    topic_source: r.topic_source,
    audience: r.audience ?? null,
    status: r.status,
    copy_json: r.copy_json ?? null,
    research_json: r.research_json ?? null,
    caption: r.caption ?? null,
    hashtags: r.hashtags ?? null,
    error_message: r.error_message ?? null,
    created_by: r.created_by ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export async function getBrandProfiles(): Promise<CarouselBrandProfile[]> {
  await assertAccess()
  const db = createAdminClient()
  const { data } = await db
    .from('carousel_brand_profiles')
    .select('*')
    .eq('active', true)
    .order('display_name')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    agent_id: r.agent_id,
    tenant_id: r.tenant_id,
    display_name: r.display_name,
    instagram_handle: r.instagram_handle,
    agency_name: r.agency_name ?? null,
    market: r.market ?? null,
    language: r.language,
    brand_voice: r.brand_voice ?? null,
    active: r.active,
  }))
}

export async function getRecentJobs(limit = 12): Promise<CarouselJob[]> {
  await assertAccess()
  const db = createAdminClient()
  const { data } = await db
    .from('carousel_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(mapJob)
}

// ── Reporte de costo por carrusel ────────────────────────────────────────────
// El copy (Claude) tiene costo REAL registrado en ai_usage_events. La
// investigación (Gemini) y las imágenes (Nano Banana) van al free tier de
// Google y no se registran ahí, así que se ESTIMAN con tarifas aproximadas —
// marcadas claramente como estimado en la UI.
const IMAGE_EST_USD = 0.039   // Nano Banana (gemini-2.5-flash-image), aprox por imagen
const RESEARCH_EST_USD = 0.003 // Gemini 2.5 Flash con grounding, aprox por carrusel

export interface CarouselCostRow {
  jobId:        string
  topic:        string | null
  status:       string
  createdAt:    string
  topicSource:  string
  copyCostUsd:  number   // real (Claude), de ai_usage_events
  copyTokensIn: number
  copyTokensOut:number
  imageCount:   number   // slides con imagen Nano Banana
  imageEstUsd:  number   // estimado
  researchEstUsd: number // estimado (0 si el tema fue manual)
  totalEstUsd:  number   // copy real + estimados
}

export interface CarouselCostReport {
  rows:            CarouselCostRow[]
  totalCopyUsd:    number   // real
  totalEstUsd:     number   // real + estimados
  totalImages:     number
  carousels:       number
}

export async function getCarouselCosts(limit = 30): Promise<CarouselCostReport> {
  await assertAccess()
  const db = createAdminClient()

  const { data: jobs } = await db
    .from('carousel_jobs')
    .select('id, topic, status, topic_source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  const jobRows = jobs ?? []
  if (jobRows.length === 0) {
    return { rows: [], totalCopyUsd: 0, totalEstUsd: 0, totalImages: 0, carousels: 0 }
  }
  const jobIds = jobRows.map((j: { id: string }) => j.id)

  // Costo real del copy (Claude) por job — feature 'carousel_copy', metadata.job_id.
  const { data: usage } = await db
    .from('ai_usage_events')
    .select('cost_usd, input_tokens, output_tokens, metadata')
    .eq('feature', 'carousel_copy')
  const copyByJob = new Map<string, { cost: number; tin: number; tout: number }>()
  for (const u of usage ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jid = (u as any).metadata?.job_id as string | undefined
    if (!jid) continue
    const cur = copyByJob.get(jid) ?? { cost: 0, tin: 0, tout: 0 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cur.cost += Number((u as any).cost_usd ?? 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cur.tin += Number((u as any).input_tokens ?? 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cur.tout += Number((u as any).output_tokens ?? 0)
    copyByJob.set(jid, cur)
  }

  // Nº de imágenes Nano Banana por job.
  const { data: slides } = await db
    .from('carousel_slides')
    .select('job_id, image_source')
    .in('job_id', jobIds)
    .eq('image_source', 'nano_banana')
  const imagesByJob = new Map<string, number>()
  for (const s of slides ?? []) {
    const jid = (s as { job_id: string }).job_id
    imagesByJob.set(jid, (imagesByJob.get(jid) ?? 0) + 1)
  }

  const rows: CarouselCostRow[] = jobRows.map((j: {
    id: string; topic: string | null; status: string; topic_source: string; created_at: string
  }) => {
    const copy = copyByJob.get(j.id) ?? { cost: 0, tin: 0, tout: 0 }
    const imageCount = imagesByJob.get(j.id) ?? 0
    const imageEstUsd = imageCount * IMAGE_EST_USD
    const researchEstUsd = j.topic_source === 'trend_research' ? RESEARCH_EST_USD : 0
    return {
      jobId: j.id,
      topic: j.topic ?? null,
      status: j.status,
      createdAt: j.created_at,
      topicSource: j.topic_source,
      copyCostUsd: copy.cost,
      copyTokensIn: copy.tin,
      copyTokensOut: copy.tout,
      imageCount,
      imageEstUsd,
      researchEstUsd,
      totalEstUsd: copy.cost + imageEstUsd + researchEstUsd,
    }
  })

  return {
    rows,
    totalCopyUsd: rows.reduce((a, r) => a + r.copyCostUsd, 0),
    totalEstUsd: rows.reduce((a, r) => a + r.totalEstUsd, 0),
    totalImages: rows.reduce((a, r) => a + r.imageCount, 0),
    carousels: rows.length,
  }
}

export async function getJobWithSlides(jobId: string): Promise<CarouselJobWithSlides | null> {
  await assertAccess()
  const db = createAdminClient()
  const { data: job } = await db.from('carousel_jobs').select('*').eq('id', jobId).maybeSingle()
  if (!job) return null
  const { data: slides } = await db
    .from('carousel_slides')
    .select('*')
    .eq('job_id', jobId)
    .order('slide_number')
  return { ...mapJob(job), slides: (slides ?? []).map(mapSlide) }
}
