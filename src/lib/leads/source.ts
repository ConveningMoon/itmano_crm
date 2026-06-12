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
const DIRECT_ENTRY_SOURCES: Record<string, LeadSource> = {
  direct:    { kind: 'manual',    label: 'Registro manual' },
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

// The 7 filter options shown in /leads (value = kind), in display order.
export const LEAD_SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'manual',       label: 'Registro manual' },
  { value: 'instagram',    label: 'Instagram' },
  { value: 'facebook',     label: 'Facebook' },
  { value: 'whatsapp',     label: 'WhatsApp' },
  { value: 'lead_magnet',  label: 'Lead Magnet' },
  { value: 'event',        label: 'Evento' },
  { value: 'contact_form', label: 'Formulario Web' },
]
