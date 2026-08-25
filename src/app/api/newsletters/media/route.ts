import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { columns } from '@/lib/supabase/columns'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// Sube una imagen (portada de edición o bloque de imagen) al bucket público
// `newsletter-media` y devuelve su URL. Route Handler, NO Server Action, por
// el mismo motivo ya documentado en src/app/api/properties/media/route.ts:
// una Server Action hace POST a la ruta de la página (/newsletters/[id] o
// /newsletters/nueva), que src/proxy.ts (el guard de auth) intercepta, y
// pasar un File binario por esa capa corrompe la subida. /api/* está excluido
// del matcher del proxy, así que este handler recibe el multipart intacto.
//
// La Task 10 SÍ lo implementó como Server Action (`uploadNewsletterMedia` en
// actions.ts) porque el brief lo pedía así sin conocer este precedente; se
// corrigió en la revisión de esa misma tarea. NO lo vuelvas a convertir en
// Server Action — es exactamente el bug que este archivo existe para evitar.
//
// Se autogestiona el contexto (getCurrentTenantContext) y el gate de plan
// (canUseNewsletters) porque el proxy no cubre /api — es la misma comprobación
// que hace guard() en actions.ts, repetida aquí porque este endpoint HTTP no
// pasa por esa función.

const MAX_MEDIA_BYTES = 8 * 1024 * 1024
const ALLOWED_MEDIA   = ['image/png', 'image/jpeg', 'image/webp']
const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg',
}

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])

export async function POST(request: Request): Promise<NextResponse> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id) {
    return NextResponse.json({ ok: false, error: 'Selecciona un tenant primero.' }, { status: 403 })
  }

  const db = createAdminClient()
  const { data: subRow } = await db
    .from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('tenant_id', ctx.tenant_id).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  if (!canUseNewsletters({ role: ctx.role }, plan)) {
    return NextResponse.json({ ok: false, error: 'Tu plan no incluye newsletters.' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'No llegó ningún archivo.' }, { status: 400 })
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ ok: false, error: 'La imagen supera los 8 MB.' }, { status: 400 })
  }
  if (!ALLOWED_MEDIA.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'Formato no admitido. Usa PNG, JPG o WebP.' }, { status: 400 })
  }

  const ext  = EXT_BY_TYPE[file.type] ?? 'jpg'
  const path = `${ctx.tenant_id}/${crypto.randomUUID()}.${ext}`

  const { error } = await db.storage
    .from('newsletter-media')
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    return NextResponse.json({ ok: false, error: `No se pudo subir la imagen: ${error.message}` }, { status: 500 })
  }

  const { data } = db.storage.from('newsletter-media').getPublicUrl(path)
  return NextResponse.json({ ok: true, url: data.publicUrl })
}
