import 'server-only'
import sharp from 'sharp'

// Shared by the property-media upload Route Handler (src/app/api/properties/media/route.ts)
// and the property Server Actions (properties/actions.ts) that reconcile/delete Storage
// objects. Upload itself lives in a Route Handler, not a Server Action — Server Action
// requests to a page route pass through src/proxy.ts (the auth middleware), and that layer
// was found to corrupt multipart/form-data bodies carrying binary File content. Route
// Handlers under /api are excluded from the proxy matcher and self-guard via
// getCurrentTenantContext, so they receive the raw request body untouched.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export const IMAGE_MIME_PREFIX = 'image/'
// Browsers report inconsistent (or blank) MIME types for some of these — e.g.
// .jfif is often "" or "image/pjpeg" depending on OS/browser — so an image is
// accepted by either a recognized image/* MIME type OR one of these
// extensions; sharp does the real validation when it tries to decode it.
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff', 'jfif', 'ico']
export const PDF_TYPES = ['application/pdf']

// Every accepted image is normalized to WebP (see convertImageToWebp) before
// upload, so only the PDF extension is looked up here.
export const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
}

export const MEDIA_BUCKET = 'property-media'

// Mirrors the team's batch_to_webp.py defaults: quality 82, method/effort 6,
// EXIF-based auto-rotation, animated GIFs preserved as animated WebP. No
// forced resize (same as running that script with no --max-width/--max-height).
export async function convertImageToWebp(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { animated: true })
    .rotate() // auto-orients from EXIF, then strips the orientation tag
    .webp({ quality: 82, effort: 6 })
    .toBuffer()
}

// kebab-case folder name from a property slug (each property gets its own folder).
export function sanitizeSlugFolder(raw: string | null | undefined): string | null {
  const s = (raw ?? '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return s || null
}

// Extracts the storage object path from a public property-media URL.
export function objectPathFromPublicUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const marker = `/${MEDIA_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const raw = url.slice(i + marker.length)
  try { return decodeURIComponent(raw) } catch { return raw }
}
