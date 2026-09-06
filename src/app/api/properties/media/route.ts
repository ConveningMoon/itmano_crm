import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { resolveTargetTenant } from '@/lib/auth/guards'
import {
  MAX_UPLOAD_BYTES,
  IMAGE_MIME_PREFIX,
  IMAGE_EXTENSIONS,
  PDF_TYPES,
  EXT_BY_TYPE,
  MEDIA_BUCKET,
  convertImageToWebp,
  sanitizeSlugFolder,
} from '@/lib/services/property-media'

// Uploads one file to the public `property-media` bucket and returns its public
// URL. Any authenticated CRM user may upload (the property-level write gate still
// applies when the URL is saved onto a property). Uploads go through the
// service-role client — the bucket has no anon write policy.
//
// This is a Route Handler, not a Server Action, on purpose: /api/* is excluded
// from src/proxy.ts's matcher, so the raw multipart/form-data body reaches this
// handler untouched. Server Actions POST to the page route itself (e.g.
// /properties), which src/proxy.ts (the Supabase-auth middleware) intercepts —
// and passing a binary File through that layer corrupted the upload (bytes came
// out round-tripped through lossy UTF-8, ~23% of the file replaced with U+FFFD).
// This handler self-guards via getCurrentTenantContext instead of relying on the
// page-level proxy.
export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await getCurrentTenantContext()

  const formData = await request.formData()
  const file = formData.get('file')
  const kind = (formData.get('kind') as string) === 'pdf' ? 'pdf' : 'image'
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Archivo no válido' }, { status: 400 })
  }

  if (kind === 'pdf') {
    if (!PDF_TYPES.includes(file.type)) {
      return NextResponse.json({ ok: false, error: 'El archivo debe ser un PDF' }, { status: 400 })
    }
  } else {
    const fileExt = (file.name.split('.').pop() ?? '').toLowerCase()
    const looksLikeImage = file.type.startsWith(IMAGE_MIME_PREFIX) || IMAGE_EXTENSIONS.includes(fileExt)
    if (!looksLikeImage) {
      return NextResponse.json(
        { ok: false, error: 'Formato no soportado (usa JPG, PNG, WebP, GIF, AVIF, BMP o TIFF)' },
        { status: 400 },
      )
    }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: 'El archivo supera el límite de 10 MB' }, { status: 400 })
  }

  // Tenant folder — resolved for hygiene; the bucket is public either way.
  const resolved = resolveTargetTenant(ctx, (formData.get('tenant_id') as string) || undefined)
  const tenantFolder = typeof resolved === 'string' ? resolved : 'shared'

  // Each property's media lives in its own folder named by its slug, so deleting
  // the property can remove the whole folder. The slug is required to upload.
  const slugFolder = sanitizeSlugFolder(formData.get('slug') as string)
  if (!slugFolder) {
    return NextResponse.json(
      { ok: false, error: 'Agrega el nombre (slug) de la propiedad antes de subir archivos.' },
      { status: 400 },
    )
  }

  let bytes: Buffer = Buffer.from(await file.arrayBuffer())
  let contentType = file.type
  let ext = EXT_BY_TYPE[file.type] ?? 'bin'

  // Every image is normalized to optimized WebP before it ever reaches
  // Storage — smaller files, one consistent format, EXIF rotation baked in.
  if (kind === 'image') {
    try {
      bytes = await convertImageToWebp(bytes)
    } catch (err) {
      console.error(JSON.stringify({ service: 'property-media-webp-convert', error: err instanceof Error ? err.message : 'unknown' }))
      return NextResponse.json(
        { ok: false, error: 'No se pudo procesar la imagen. Verifica que el archivo no esté dañado.' },
        { status: 422 },
      )
    }
    contentType = 'image/webp'
    ext = 'webp'
  }

  const path = `${tenantFolder}/${slugFolder}/${crypto.randomUUID()}.${ext}`

  // CRITICAL: wrap the bytes in a Blob. On Vercel's runtime, passing a raw Node
  // Buffer as a fetch body corrupts the binary (it gets round-tripped through
  // lossy UTF-8 — high bytes become U+FFFD). Verified empirically on the
  // deployed runtime: Buffer body → corrupt, Blob body → byte-perfect. This was
  // the root cause of every broken image since the WebP-conversion commit
  // switched the upload body from Uint8Array to Buffer.
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType })

  const db = createAdminClient()
  const { error } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, { contentType, upsert: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const { data: pub } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path)
  return NextResponse.json({ ok: true, url: pub.publicUrl })
}
