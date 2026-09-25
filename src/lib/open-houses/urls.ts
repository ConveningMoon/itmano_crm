// Enlaces públicos de un open house. PURO (el entorno entra por parámetro).
//
// El RSVP y el .ics viven en el dominio de la APP, no en el catálogo alojado:
// así el enlace de un correo enviado desde el sandbox apunta al sandbox y uno
// de producción a producción. El catálogo (properties.itmano.com) es de
// producción siempre.

import { hostedPropertiesUrl } from '@/lib/hosted-page'

export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com').replace(/\/+$/, '')
}

export function openHouseRsvpUrl(baseUrl: string, tenantSlug: string, token: string): string {
  return `${baseUrl}/web/${encodeURIComponent(tenantSlug)}/rsvp/${token}`
}

export function openHouseIcsUrl(baseUrl: string, openHouseId: string): string {
  return `${baseUrl}/api/open-houses/${openHouseId}/ics`
}

/** Página pública de la propiedad: el catálogo si está publicada, si no su enlace externo. */
export function propertyPublicUrl(
  tenantSlug: string,
  property: { slug: string | null; published_to_web: boolean; external_url: string | null },
): string {
  if (property.published_to_web && property.slug && tenantSlug) {
    return `${hostedPropertiesUrl(tenantSlug)}/${property.slug}`
  }
  return property.external_url ?? ''
}
