import { resend } from '@/lib/resend'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// TEMPORARY — smoke test only. Delete after confirming sends reach the inbox.

const bodySchema = z.object({
  to:      z.string().email(),
  subject: z.string().min(1),
  html:    z.string().min(1),
})

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { to, subject, html } = parsed.data

  const result = await resend.emails.send({
    from: 'test@mail.ajrealestateva.com',
    to,
    subject,
    html,
  })

  return NextResponse.json(result)
}
