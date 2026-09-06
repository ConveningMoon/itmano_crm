// Helpers client-safe para las páginas públicas de propiedades (sin server-only).

export const PROPERTY_TYPE_LABEL: Record<string, string> = {
  residential: 'Residencial',
  condo:       'Condominio',
  townhouse:   'Townhouse',
  land:        'Terreno',
  commercial:  'Comercial',
  multifamily: 'Multifamiliar',
}

export const PROPERTY_STATUS_LABEL: Record<string, string> = {
  available:  'Disponible',
  in_process: 'En proceso',
  sold:       'Vendida',
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return 'Consultar'
  return `$${Number(price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function bathroomsLabel(full: number | null, half: number | null): string {
  const f = full ?? 0
  const h = half ?? 0
  if (f === 0 && h === 0) return '—'
  return h > 0 ? `${f}.${h > 0 ? '5' : '0'}` : String(f)
}
