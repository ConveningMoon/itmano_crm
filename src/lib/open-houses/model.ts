// Modelo de un open house (migración open_houses). Módulo PURO: lo comparten el
// servidor (actions, despachador, página pública) y el cliente (formularios).
//
// Un open house nace en `draft`, se confirma a `scheduled` y puede terminar en
// `cancelled`. "Terminado" no es un estado: se deriva de `ends_at`, porque un
// evento que ya pasó no necesita que nadie lo cierre.

export const OPEN_HOUSE_STATUSES = ['draft', 'scheduled', 'cancelled'] as const
export type OpenHouseStatus = (typeof OPEN_HOUSE_STATUSES)[number]

export const OPEN_HOUSE_EMAIL_KINDS = ['announcement', 'reminder', 'update', 'cancellation'] as const
export type OpenHouseEmailKind = (typeof OPEN_HOUSE_EMAIL_KINDS)[number]

export const OPEN_HOUSE_EMAIL_STATUSES = ['pending', 'sending', 'sent', 'cancelled', 'failed'] as const
export type OpenHouseEmailStatus = (typeof OPEN_HOUSE_EMAIL_STATUSES)[number]

// Los idiomas posibles de un correo de open house son los que puede tener un
// LEAD (leads.language: es | en | pt). Ofrecer otro sería escribir un correo
// que ningún lead puede recibir. El máximo de 3 lo fija también la base.
export const OPEN_HOUSE_LANGUAGES = ['es', 'en', 'pt'] as const
export type OpenHouseLanguage = (typeof OPEN_HOUSE_LANGUAGES)[number]
export const MAX_OPEN_HOUSE_LANGUAGES = 3

export function isOpenHouseLanguage(l: string): l is OpenHouseLanguage {
  return (OPEN_HOUSE_LANGUAGES as readonly string[]).includes(l)
}

export const AUDIENCE_MATCHES = ['any', 'all'] as const
export type AudienceMatch = (typeof AUDIENCE_MATCHES)[number]

// Etiquetas preseleccionadas al crear un open house. Son slugs del catálogo POR
// DEFECTO del producto (seed_default_lead_tags), no configuración de un
// cliente: si el tenant las borró o renombró su slug, simplemente no aparecen
// preseleccionadas y la audiencia se elige a mano.
export const DEFAULT_AUDIENCE_TAG_SLUGS = ['pre-aprobado', 'contactado-sin-respuesta'] as const

export const KIND_LABEL: Record<OpenHouseEmailKind, string> = {
  announcement: 'Anuncio',
  reminder:     'Recordatorio',
  update:       'Aviso de cambio',
  cancellation: 'Aviso de cancelación',
}

export const KIND_AUDIENCE_LABEL: Record<OpenHouseEmailKind, string> = {
  announcement: 'Leads con las etiquetas elegidas',
  reminder:     'Sólo quienes confirmaron asistencia',
  update:       'Quienes recibieron el anuncio o confirmaron',
  cancellation: 'Quienes recibieron el anuncio o confirmaron',
}

export const STATUS_LABEL: Record<OpenHouseStatus, string> = {
  draft:     'Borrador',
  scheduled: 'Confirmado',
  cancelled: 'Cancelado',
}

export const EMAIL_STATUS_LABEL: Record<OpenHouseEmailStatus, string> = {
  pending:   'Programado',
  sending:   'Enviando',
  sent:      'Enviado',
  cancelled: 'Cancelado',
  failed:    'Falló',
}

// Motivos por los que un lead de la audiencia NO recibe el correo. Se guardan
// en open_house_email_recipients.skip_reason y se muestran en la vista previa.
export const SKIP_REASONS = ['no_email', 'email_blocked', 'no_language'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  no_email:      'Sin email',
  email_blocked: 'Email bloqueado (baja, rebote o spam)',
  no_language:   'Su idioma no tiene versión en este open house',
}

/** Estado visible: el guardado más "terminado" si el evento ya pasó. */
export type OpenHouseDisplayState = OpenHouseStatus | 'finished'

export function displayState(
  status: OpenHouseStatus,
  endsAt: string | Date,
  now: Date = new Date(),
): OpenHouseDisplayState {
  if (status === 'scheduled' && new Date(endsAt).getTime() <= now.getTime()) return 'finished'
  return status
}

export const DISPLAY_STATE_LABEL: Record<OpenHouseDisplayState, string> = {
  ...STATUS_LABEL,
  finished: 'Terminado',
}
