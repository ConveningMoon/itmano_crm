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

// Cliente admin cacheado solo para construir URLs públicas (getPublicUrl es
// síncrono y sin estado); evita crear un cliente por slide al abrir un carrusel.
let urlClient: ReturnType<typeof createAdminClient> | null = null
function publicUrl(path: string | null): string | null {
  if (!path) return null
  urlClient ??= createAdminClient()
  return urlClient.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
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
    style_prompt: r.style_prompt ?? null,
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
// Fuente: carousel_logs (migración 068). Cada generación registra su fila con
// costo — el copy (Claude) es REAL; investigación e imágenes (Google) son
// ESTIMADO. Como CADA imagen (incl. regeneraciones) inserta su fila, el costo
// por regeneración SÍ queda contabilizado.

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

// Desglose por API / acción (proveedor + modelo + facturación).
export interface CarouselApiCost {
  provider:      string   // 'Anthropic' | 'Google Gemini' | 'Google Nano Banana'
  action:        string   // 'Copy del carrusel' | 'Investigación de tendencias' | 'Imágenes editoriales'
  model:         string
  billing:       'real' | 'estimado'
  requests:      number
  inputTokens?:  number
  outputTokens?: number
  costUsd:       number
}

export interface CarouselCostReport {
  rows:            CarouselCostRow[]
  byApi:           CarouselApiCost[]
  totalCopyUsd:    number   // real
  totalEstUsd:     number   // real + estimados
  totalImages:     number
  carousels:       number
}

interface CostLogRow { job_id: string; step: string; provider: string | null; model: string | null; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null }

export async function getCarouselCosts(limit = 30): Promise<CarouselCostReport> {
  await assertAccess()
  const db = createAdminClient()

  const { data: jobs } = await db
    .from('carousel_jobs')
    .select('id, topic, status, topic_source, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  const jobRows = (jobs ?? []) as { id: string; topic: string | null; status: string; topic_source: string; created_at: string }[]
  if (jobRows.length === 0) {
    return { rows: [], byApi: [], totalCopyUsd: 0, totalEstUsd: 0, totalImages: 0, carousels: 0 }
  }
  const jobIds = jobRows.map((j) => j.id)

  // Ledger: pasos de generación con costo (copy/research/image), incl. regen.
  const { data: logs } = await db
    .from('carousel_logs')
    .select('job_id, step, provider, model, cost_usd, input_tokens, output_tokens')
    .in('job_id', jobIds)
    .in('step', ['copy', 'research', 'image'])
    .not('cost_usd', 'is', null)
  const logRows = (logs ?? []) as CostLogRow[]

  // Agregado por job.
  const agg = new Map<string, { copy: number; tin: number; tout: number; research: number; images: number; imageEst: number }>()
  const model = { copy: 'claude-sonnet-5', research: 'gemini-flash-latest', image: 'gemini image (nano banana)' }
  for (const l of logRows) {
    const a = agg.get(l.job_id) ?? { copy: 0, tin: 0, tout: 0, research: 0, images: 0, imageEst: 0 }
    const cost = Number(l.cost_usd ?? 0)
    if (l.step === 'copy') { a.copy += cost; a.tin += l.input_tokens ?? 0; a.tout += l.output_tokens ?? 0; if (l.model) model.copy = l.model }
    else if (l.step === 'research') { a.research += cost; if (l.model) model.research = l.model }
    else if (l.step === 'image') { a.images += 1; a.imageEst += cost; if (l.model) model.image = l.model }
    agg.set(l.job_id, a)
  }

  const rows: CarouselCostRow[] = jobRows.map((j) => {
    const a = agg.get(j.id) ?? { copy: 0, tin: 0, tout: 0, research: 0, images: 0, imageEst: 0 }
    return {
      jobId: j.id, topic: j.topic ?? null, status: j.status, createdAt: j.created_at, topicSource: j.topic_source,
      copyCostUsd: a.copy, copyTokensIn: a.tin, copyTokensOut: a.tout,
      imageCount: a.images, imageEstUsd: a.imageEst, researchEstUsd: a.research,
      totalEstUsd: a.copy + a.imageEst + a.research,
    }
  })

  // Desglose por API / acción (requests = nº de llamadas reales, incl. regen).
  const copyReqs = logRows.filter((l) => l.step === 'copy').length
  const researchReqs = logRows.filter((l) => l.step === 'research').length
  const imageReqs = logRows.filter((l) => l.step === 'image').length
  const totalCopyUsd = rows.reduce((s, r) => s + r.copyCostUsd, 0)

  const byApi: CarouselApiCost[] = [
    {
      provider: 'Anthropic', action: 'Copy del carrusel', model: model.copy, billing: 'real', requests: copyReqs,
      inputTokens: rows.reduce((s, r) => s + r.copyTokensIn, 0), outputTokens: rows.reduce((s, r) => s + r.copyTokensOut, 0),
      costUsd: totalCopyUsd,
    },
    { provider: 'Google Gemini', action: 'Investigación de tendencias', model: model.research, billing: 'estimado', requests: researchReqs, costUsd: rows.reduce((s, r) => s + r.researchEstUsd, 0) },
    { provider: 'Google Nano Banana', action: 'Imágenes editoriales (incl. regen)', model: model.image, billing: 'estimado', requests: imageReqs, costUsd: rows.reduce((s, r) => s + r.imageEstUsd, 0) },
  ]

  return {
    rows, byApi, totalCopyUsd,
    totalEstUsd: rows.reduce((s, r) => s + r.totalEstUsd, 0),
    totalImages: imageReqs,
    carousels: rows.length,
  }
}

// ── Registro del proceso (para diagnóstico / vista de logs) ──────────────────
export interface CarouselLogRow {
  id:           string
  slide_number: number | null
  level:        string
  step:         string
  message:      string
  provider:     string | null
  model:        string | null
  billing:      string | null
  cost_usd:     number | null
  detail:       unknown
  created_at:   string
}

export async function getCarouselLogs(jobId: string): Promise<CarouselLogRow[]> {
  await assertAccess()
  const db = createAdminClient()
  const { data } = await db
    .from('carousel_logs')
    .select('id, slide_number, level, step, message, provider, model, billing, cost_usd, detail, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, slide_number: r.slide_number, level: r.level, step: r.step, message: r.message,
    provider: r.provider, model: r.model, billing: r.billing, cost_usd: r.cost_usd, detail: r.detail, created_at: r.created_at,
  }))
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
