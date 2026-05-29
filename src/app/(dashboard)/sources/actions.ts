'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const TENANT_ID = 'tenant-aj'

function genPublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `chn_${s}`
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ─── Create Lead Magnet channel + empty email sequence ────────────────────────

export interface CreateLeadMagnetResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  sequenceId: string
  embedSnippet: string
}

export async function createLeadMagnet(fields: {
  name:    string
  slug?:   string
  lpUrl?:  string
  fileUrl?: string
}): Promise<CreateLeadMagnetResult | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const supabase  = createAdminClient()
  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()
  const seqId     = crypto.randomUUID()

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existing) return { ok: false, error: `El slug "${slug}" ya está en uso. Elige otro.` }

  const { error: chErr } = await supabase.from('acquisition_channels').insert({
    id:           channelId,
    tenant_id:    TENANT_ID,
    public_id:    publicId,
    channel_type: 'lead_magnet',
    name:         fields.name.trim(),
    slug,
    active:       true,
    metadata:     {
      lp_url:   fields.lpUrl?.trim()   || null,
      file_url: fields.fileUrl?.trim() || null,
    },
  })

  if (chErr) return { ok: false, error: chErr.message }

  const { error: seqErr } = await supabase.from('email_sequences').insert({
    id:       seqId,
    tenant_id: TENANT_ID,
    name:     `Secuencia · ${fields.name.trim()}`,
    active:   true,
  })

  if (seqErr) return { ok: false, error: seqErr.message }

  // Set back-reference
  await supabase
    .from('acquisition_channels')
    .update({ email_sequence_id: seqId })
    .eq('id', channelId)

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const embedSnippet = `<script>
  (function(){
    var d = {v: localStorage.getItem('_itm_vid') || (function(){
      var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;
    })()};
    navigator.sendBeacon('${baseUrl}/api/intake/${publicId}/view', JSON.stringify(d));
  })();
</script>`

  return { ok: true, channelId, publicId, slug, sequenceId: seqId, embedSnippet }
}

// ─── Update channel (name + active) ──────────────────────────────────────────

export async function updateChannel(
  channelId: string,
  fields: { name: string; active: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('acquisition_channels')
    .update({ name: fields.name.trim(), active: fields.active })
    .eq('id', channelId)
    .eq('tenant_id', TENANT_ID)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')
  return { ok: true }
}

// ─── Archive channel (soft-delete) ────────────────────────────────────────────

export async function archiveChannel(
  channelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('acquisition_channels')
    .update({ active: false, archived_at: new Date().toISOString() })
    .eq('id', channelId)
    .eq('tenant_id', TENANT_ID)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')
  return { ok: true }
}

// ─── Create Event channel ─────────────────────────────────────────────────────

export interface CreateEventResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  formSnippet: string
}

export async function createEvent(fields: {
  name:      string
  slug?:     string
  eventDate?: string
  location?: string
}): Promise<CreateEventResult | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const supabase  = createAdminClient()
  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()

  const { data: existing } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existing) return { ok: false, error: `El slug "${slug}" ya está en uso. Elige otro.` }

  const { error: chErr } = await supabase.from('acquisition_channels').insert({
    id:           channelId,
    tenant_id:    TENANT_ID,
    public_id:    publicId,
    channel_type: 'event',
    name:         fields.name.trim(),
    slug,
    active:       true,
    metadata:     {
      event_date: fields.eventDate?.trim() || null,
      location:   fields.location?.trim()  || null,
    },
  })

  if (chErr) return { ok: false, error: chErr.message }

  revalidatePath('/sources')
  revalidatePath('/analytics')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const formSnippet = `<form action="${baseUrl}/api/intake/${publicId}/submit" method="POST">
  <input type="hidden" name="traffic_source" value="direct">
  <input type="text"   name="first_name"    placeholder="Nombre"   required>
  <input type="text"   name="last_name"     placeholder="Apellido">
  <input type="email"  name="email"         placeholder="Email"    required>
  <input type="tel"    name="phone"         placeholder="Teléfono">
  <!-- Honeypot (invisible, must be empty) -->
  <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Registrarme al evento</button>
</form>`

  return { ok: true, channelId, publicId, slug, formSnippet }
}
