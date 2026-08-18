import 'server-only'

// El puente hacia /api/studio/render. Existe para que generate.ts NO importe
// Chromium: si lo importara, esos 50 MB acabarían en el bundle de /studio.
//
// La regla del proyecto contra el auto-POST (processSequenceRun) no aplica: allí
// el problema era una carrera de visibilidad de filas en la base. Esta ruta no
// lee nada — recibe HTML y devuelve bytes.

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function renderDocument(
  document: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const secret = process.env.STUDIO_RENDER_SECRET
  if (!secret) throw new Error('Falta STUDIO_RENDER_SECRET')

  const res = await fetch(`${baseUrl()}/api/studio/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ document, ...opts }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`El render devolvió ${res.status}: ${detail.slice(0, 200)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}
