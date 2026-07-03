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
    const changed = rows.filter((r: { status_changed: boolean }) => r.status_changed)

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      affected: rows.length,
      status_changes: changed.length,
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
