// Cabeceras de seguridad (next.config.ts → headers()).
//
// El CRM no debe poder incrustarse en un iframe de otro sitio (clickjacking:
// una web ajena encima de una sesión abierta de app.itmano.com). Las páginas
// alojadas SÍ se incrustan a propósito: el código "Embebible en tu web" de
// Propiedades y Fuentes es un <iframe> hacia lm., events., forms., properties.
// y news.itmano.com. Por eso el bloqueo de framing excluye esos hosts.
//
// Dentro del CRM se usan iframes del mismo origen (editor del Estudio,
// vista previa de correos), así que el valor es 'self' y no 'none'.

type Header = { key: string; value: string }
type HostCondition = { type: 'host'; value: string }

/** Hosts de páginas alojadas (ver HOSTED_SUBDOMAIN_REWRITE). */
export const HOSTED_HOST_PATTERN = '(?:lm|events|forms|properties|news)\\..+'

export const BASE_SECURITY_HEADERS: Header[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
]

export const APP_FRAME_HEADERS: Header[] = [
  { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
]

export function securityHeaders(): { source: string; headers: Header[]; missing?: HostCondition[] }[] {
  return [
    { source: '/:path*', headers: BASE_SECURITY_HEADERS },
    {
      source:  '/:path*',
      missing: [{ type: 'host', value: HOSTED_HOST_PATTERN }],
      headers: APP_FRAME_HEADERS,
    },
  ]
}
