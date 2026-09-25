'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRsvpToken } from '@/lib/open-houses/rsvp-token'
import { recordOpenHouseRsvp, RSVP_ERROR_MESSAGE } from '@/lib/services/open-house-rsvp'

// Respuesta desde el enlace firmado del correo. El token identifica al lead:
// no se pide ningún dato, sólo sí/no y acompañantes.

const Schema = z.object({
  token:    z.string().min(10).max(400),
  response: z.enum(['yes', 'no']),
  guests:   z.number().int().min(0).max(10),
})

export async function respondToOpenHouse(raw: { token: string; response: 'yes' | 'no'; guests: number }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = Schema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida.' }
  const ids = verifyRsvpToken(parsed.data.token)
  if (!ids) return { ok: false, error: RSVP_ERROR_MESSAGE.not_found }

  const res = await recordOpenHouseRsvp(createAdminClient(), {
    openHouseId: ids.openHouseId,
    leadId:      ids.leadId,
    response:    parsed.data.response,
    guests:      parsed.data.guests,
    source:      'email',
  })
  if (!res.ok) return { ok: false, error: RSVP_ERROR_MESSAGE[res.error] }
  return { ok: true }
}
