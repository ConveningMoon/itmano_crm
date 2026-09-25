import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { CORS_HEADERS, corsOptions } from '@/app/api/intake/cors'
import { recordOpenHouseRsvp, RSVP_ERROR_MESSAGE, type RsvpError } from '@/lib/services/open-house-rsvp'

// RSVP público de un open house: lo llaman la ficha alojada por ITMANO y la
// web propia del cliente (ver el prompt de integración). Misma defensa que el
// intake de formularios: id no adivinable + honeypot + validación de schema,
// no restricción de origen — la web del cliente vive en otro dominio.

export function OPTIONS() {
  return corsOptions()
}

const RsvpSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name:  z.string().trim().max(100).optional().default(''),
  email:      z.string().trim().email().max(254).transform(s => s.toLowerCase()),
  phone:      z.string().trim().max(30).optional(),
  language:   z.enum(['es', 'en', 'pt']).default('es'),
  response:   z.enum(['yes', 'no']).default('yes'),
  guests:     z.coerce.number().int().min(0).max(10).optional().default(0),
  website:    z.string().optional(), // honeypot
})

const STATUS_BY_ERROR: Record<RsvpError, number> = {
  not_found:     404,
  cancelled:     409,
  ended:         409,
  rsvp_disabled: 409,
  no_agent:      500,
  failed:        500,
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: RSVP_ERROR_MESSAGE.not_found }, { status: 404, headers: CORS_HEADERS })
  }

  let body: z.infer<typeof RsvpSchema>
  try {
    const parsed = RsvpSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Revisa tu nombre y tu email.' }, { status: 400, headers: CORS_HEADERS })
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ ok: false, error: 'Solicitud inválida.' }, { status: 400, headers: CORS_HEADERS })
  }

  // Honeypot: respuesta de éxito para no darle pistas al bot.
  if (body.website) return NextResponse.json({ ok: true, status: 'created' }, { headers: CORS_HEADERS })

  const res = await recordOpenHouseRsvp(createAdminClient(), {
    openHouseId: id,
    response:    body.response,
    guests:      body.guests,
    source:      'web',
    visitor: {
      firstName: body.first_name,
      lastName:  body.last_name,
      email:     body.email,
      phone:     body.phone || null,
      language:  body.language,
    },
  })
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: RSVP_ERROR_MESSAGE[res.error] }, { status: STATUS_BY_ERROR[res.error], headers: CORS_HEADERS })
  }
  return NextResponse.json({ ok: true, status: res.status }, { headers: CORS_HEADERS })
}
