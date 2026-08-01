import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dry_run') === 'true'

  try {
    const supabase = createAdminClient()

    const { data, error } = await supabase.rpc('decay_lead_scores', {
      p_dry_run: dryRun,
    })

    if (error) throw error

    const rows = data ?? []
    const changed = rows.filter((r: { stage_changed: boolean }) => r.stage_changed)

    // Cortes de banda de calidad (migración 076). Van en este cron y no en uno
    // propio porque comparten cadencia: los quintiles se recalculan 1×/día para
    // que la etiqueta de un lead no cambie a media jornada porque entraron otros.
    // Si falla, no se aborta el decay —que ya se aplicó— y las bandas siguen
    // usando los cortes del día anterior.
    let bandsRefreshed: number | null = null
    if (!dryRun) {
      const { data: bands, error: bandsError } = await supabase.rpc('refresh_quality_bands')
      if (bandsError) {
        console.error(JSON.stringify({ service: 'score-decay', step: 'refresh_quality_bands', error: bandsError.message }))
      } else {
        bandsRefreshed = (bands as number | null) ?? 0
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      affected: rows.length,
      stage_changes: changed.length,
      quality_bands_refreshed: bandsRefreshed,
      ts: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[score-decay]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 }
    )
  }
}
