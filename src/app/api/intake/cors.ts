// Shared CORS headers for all intake endpoints.
// Security comes from the non-guessable public_id + Zod validation + honeypot,
// not from origin restriction — landing pages live on third-party domains.
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

export function corsOptions(): Response {
  return new Response(null, { status: 200, headers: CORS_HEADERS })
}
