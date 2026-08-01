// Composite "source" of a lead: if it has a channel, the channel type; if not
// (direct entry), its traffic_source. Pure + shared between the /leads column, the
// /leads filter, and the unit tests. `kind` is the stable filter key; `label` is the
// Spanish display.

export interface LeadSource {
  kind:  string
  label: string
}

// Channel-backed sources (lead_magnet/event/contact_form are the live ones; manual
// and manychat_flow are legacy channels kept only for display — see CLAUDE.md).
const CHANNEL_SOURCES: Record<string, LeadSource> = {
  lead_magnet:   { kind: 'lead_magnet',  label: 'Lead Magnet' },
  event:         { kind: 'event',        label: 'Evento' },
  contact_form:  { kind: 'contact_form', label: 'Formulario Web' },
  manual:        { kind: 'manual',       label: 'Registro manual' },
  manychat_flow: { kind: 'manychat',     label: 'ManyChat' },
}

// Direct-entry sources (no channel) keyed by traffic_source.
//
// 'import' son leads traídos de otro CRM: no los captó ningún canal de ITMANO.
// Tienen fuente propia para que no se cuelen en la analítica de canales — si van
// como 'direct', "Registro manual" aparece como el canal que más cierra, cuando
// en realidad esos cierres ocurrieron fuera del sistema.
const DIRECT_ENTRY_SOURCES: Record<string, LeadSource> = {
  direct:    { kind: 'manual',    label: 'Registro manual' },
  import:    { kind: 'import',    label: 'Importación' },
  instagram: { kind: 'instagram', label: 'Instagram' },
  facebook:  { kind: 'facebook',  label: 'Facebook' },
  whatsapp:  { kind: 'whatsapp',  label: 'WhatsApp' },
}

// Other traffic_source values (campaigns/referrals) — labeled but not in the filter
// options; folded under kind 'other'.
const OTHER_TRAFFIC_LABELS: Record<string, string> = {
  referral:       'Referido',
  ads_meta:       'Ads (Meta)',
  ads_google:     'Ads (Google)',
  organic_social: 'Social orgánico',
  unknown:        'Desconocido',
}

export function getLeadSource(
  channelType: string | null,
  trafficSource: string | null,
): LeadSource {
  if (channelType && CHANNEL_SOURCES[channelType]) return CHANNEL_SOURCES[channelType]

  const ts = trafficSource ?? ''
  if (DIRECT_ENTRY_SOURCES[ts]) return DIRECT_ENTRY_SOURCES[ts]
  if (OTHER_TRAFFIC_LABELS[ts]) return { kind: 'other', label: OTHER_TRAFFIC_LABELS[ts] }
  return { kind: 'other', label: '—' }
}

// ── Traducción del filtro a condiciones sobre columnas de `leads` ─────────────
// El filtro de fuente vive en el servidor: `kind` no es una columna, así que hay
// que resolverlo a los tipos de canal y a los valores de traffic_source que lo
// producen. Se derivan de los mismos mapas de arriba para que no puedan divergir
// de getLeadSource().

// Tipos de acquisition_channels.channel_type que producen este kind.
export function channelTypesForKind(kind: string): string[] {
  return Object.entries(CHANNEL_SOURCES)
    .filter(([, src]) => src.kind === kind)
    .map(([channelType]) => channelType)
}

// Valores de leads.traffic_source que producen este kind cuando el lead no tiene
// canal (entrada directa).
export function trafficSourcesForKind(kind: string): string[] {
  return Object.entries(DIRECT_ENTRY_SOURCES)
    .filter(([, src]) => src.kind === kind)
    .map(([trafficSource]) => trafficSource)
}

// Las opciones del filtro de /leads (value = kind), en orden de aparición.
export const LEAD_SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'manual',       label: 'Registro manual' },
  { value: 'import',       label: 'Importación' },
  { value: 'instagram',    label: 'Instagram' },
  { value: 'facebook',     label: 'Facebook' },
  { value: 'whatsapp',     label: 'WhatsApp' },
  { value: 'lead_magnet',  label: 'Lead Magnet' },
  { value: 'event',        label: 'Evento' },
  { value: 'contact_form', label: 'Formulario Web' },
]
