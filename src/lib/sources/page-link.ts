// Dónde vive la página pública de una fuente, si es que ya vive en algún lado.
// Puro y client-safe: lo consume la tarjeta de /sources para abrirla de un clic.

import { hostedChannelUrl } from '@/lib/hosted-page'

export interface ChannelPageInput {
  channelType:       string
  slug:              string
  /** metadata.page_url — link registrado a mano (migración 092). */
  pageUrl:           string | null
  /** hosted_page.enabled — la página del constructor está publicada. */
  hostedPageEnabled: boolean
}

/** Slug del tenant dueño + si ITMANO le administra las páginas (migración 091). */
export interface TenantPageInfo {
  slug:            string
  managedByItmano: boolean
}

/**
 * El link explícito gana: es el que registra ITMANO para los tenants que
 * administra, y el que declara quien ya tenía su propia landing.
 *
 * Si no hay, queda la página del constructor — pero sólo cuando está PUBLICADA.
 * Un borrador abriría una URL que todavía no sirve nada, que es peor que decir
 * que no hay página.
 */
export function resolveChannelPageUrl(
  ch: ChannelPageInput,
  tenant?: TenantPageInfo,
): string | null {
  if (ch.pageUrl) return ch.pageUrl
  if (ch.hostedPageEnabled && tenant?.slug) {
    return hostedChannelUrl(ch.channelType, tenant.slug, ch.slug)
  }
  return null
}
