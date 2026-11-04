// Analytics se retiró: sus dos páginas viven ahora como pestañas del Dashboard.
// Redirecciones temporales (no 308) para poder cambiar el destino sin que los
// navegadores lo recuerden. Aparte de next.config.ts para poder probarlas.
export const redirects = [
  { source: '/analytics', destination: '/dashboard?tab=general', permanent: false },
  { source: '/analytics/emails', destination: '/dashboard?tab=emails', permanent: false },
]
