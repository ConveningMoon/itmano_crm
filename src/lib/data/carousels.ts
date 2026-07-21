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
