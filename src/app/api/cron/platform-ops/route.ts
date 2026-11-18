import { NextResponse } from 'next/server'
import { withHeartbeat } from '@/lib/ops/heartbeat'
import { runPlatformOps } from '@/lib/services/platform-ops'

// Pasada diaria del panel de operación: foto de métricas, alertas por Telegram
// y purga (src/lib/services/platform-ops.ts). Vercel Cron (vercel.json) llama
// con GET y `Authorization: Bearer CRON_SECRET`.
async function handler(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const report = await runPlatformOps()
    // Un paso fallido no aborta los demás, pero sí marca la ejecución como
    // fallida en el latido: el panel lo muestra en rojo.
    if (report.errors.length > 0) {
      console.error(JSON.stringify({ service: 'platform-ops', errors: report.errors }))
      return NextResponse.json({ ok: false, report }, { status: 500 })
    }
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    console.error(JSON.stringify({ service: 'platform-ops', error: err instanceof Error ? err.message : String(err) }))
    return NextResponse.json({ ok: false, error: 'platform_ops_failed' }, { status: 500 })
  }
}

export const GET = withHeartbeat('cron:platform-ops', handler)
