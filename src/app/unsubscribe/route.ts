import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeSignature } from '@/lib/services/unsubscribe-url'

// ─── Shared unsubscribe logic ──────────────────────────────────────────────────
// Returns structured result so GET and POST can each format their own response.

type UnsubscribeResult =
  | { ok: false }
  | { ok: true; tenantName: string; agentEmail: string }

async function executeUnsubscribe(lead: string, sig: string): Promise<UnsubscribeResult> {
  if (!verifyUnsubscribeSignature(lead, sig)) return { ok: false }

  const db = createAdminClient()

  const { data: leadRow } = await db
    .from('leads')
    .select('id, tenant_id, agent_id')
    .eq('id', lead)
    .maybeSingle()

  if (!leadRow) return { ok: false }

  const [tenantRes, agentRes] = await Promise.all([
    db.from('tenants').select('name').eq('id', leadRow.tenant_id).maybeSingle(),
    db.from('agents').select('email').eq('id', leadRow.agent_id).maybeSingle(),
  ])

  const tenantName = tenantRes.data?.name ?? 'nuestro equipo'
  const agentEmail = agentRes.data?.email ?? ''

  // Insert the unsubscribe event — idempotent via fixed dedup_key
  const { error: insertError } = await db.from('lead_events').insert({
    lead_id:     leadRow.id,
    tenant_id:   leadRow.tenant_id,
    type:        'email_unsubscribed',
    description: 'Lead unsubscribed via email link',
    dedup_key:   `unsub:${leadRow.id}`,
    metadata:    { source: 'unsubscribe_link' },
  })

  // 23505 = already unsubscribed — idempotent, treat as success
  if (insertError && insertError.code !== '23505') {
    console.error(JSON.stringify({ service: 'unsubscribe', lead_id: leadRow.id, error: insertError.message }))
    return { ok: false }
  }

  // Set persistent block flag — best-effort; idempotent UPDATE
  await db
    .from('leads')
    .update({ email_blocked: true, email_blocked_reason: 'unsubscribed' })
    .eq('id', leadRow.id)

  return { ok: true, tenantName, agentEmail }
}

// ─── HTML rendering ────────────────────────────────────────────────────────────
// Rendered here (not via layout) since this route handles machine POST requests
// and cannot go through the Next.js page/layout pipeline.
// CSS variables are inlined so the card renders correctly without the app layout.

const CSS_VARS = `
  :root {
    --bg-base: #0B0C0E;
    --bg-surface: #111215;
    --border-subtle: rgba(255,255,255,0.06);
    --text-primary: #E8E6E1;
    --text-secondary: #A09D95;
    --text-muted: #6B6860;
    --accent-gold: #C9A96E;
    --accent-coral: #C97B6B;
    --accent-green: #6BA368;
    --font-sans: 'Inter', system-ui, sans-serif;
  }
`

function buildHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Darse de baja — ITMANO</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>${CSS_VARS}*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg-base);font-family:var(--font-sans)}</style>
</head>
<body>${body}</body>
</html>`
}

function shell(inner: string): string {
  return `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="width:100%;max-width:420px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:16px;padding:48px 36px;display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center">
    ${inner}
    <div style="font-size:11px;color:var(--text-muted);margin-top:8px;letter-spacing:0.08em">ITMANO CRM</div>
  </div>
</div>`
}

function errorHtml(): string {
  return buildHtml(shell(`
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#C97B6B" stroke-width="1.5"/>
      <path d="M15 9l-6 6M9 9l6 6" stroke="#C97B6B" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <div>
      <p style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0 0 8px">Este enlace no es válido</p>
      <p style="font-size:13px;color:var(--text-secondary);margin:0;line-height:1.6">
        Si deseas darte de baja, responde directamente al correo que recibiste.
      </p>
    </div>`))
}

function successHtml(tenantName: string, agentEmail: string): string {
  const contactLine = agentEmail
    ? `<p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.6">
        Si fue un error, escríbenos a
        <a href="mailto:${agentEmail}" style="color:#C9A96E;text-decoration:none">${agentEmail}</a>.
      </p>`
    : ''

  return buildHtml(shell(`
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#6BA368" stroke-width="1.5"/>
      <path d="M8 12l3 3 5-5" stroke="#6BA368" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div>
      <p style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0 0 8px">Te has dado de baja</p>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px;line-height:1.6">
        Ya no recibirás más correos de <strong style="color:var(--text-primary)">${tenantName}</strong>.
      </p>
      ${contactLine}
    </div>`))
}

// ─── GET — browser-initiated unsubscribe ──────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const lead = searchParams.get('lead')
  const sig  = searchParams.get('sig')

  if (!lead || !sig) {
    return new NextResponse(errorHtml(), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const result = await executeUnsubscribe(lead, sig)

  if (!result.ok) {
    return new NextResponse(errorHtml(), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  return new NextResponse(successHtml(result.tenantName, result.agentEmail), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

// ─── POST — RFC 8058 one-click unsubscribe ────────────────────────────────────
// Machine-to-machine call from the email client. No HTML response — just 200.
// The client sends: POST /unsubscribe?lead=X&sig=Y
// with body: List-Unsubscribe=One-Click  (per RFC 8058 §3.2)
// Signature is validated identically to GET. Idempotent.

export async function POST(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const lead = searchParams.get('lead')
  const sig  = searchParams.get('sig')

  if (!lead || !sig) {
    return new Response('', { status: 400 })
  }

  const result = await executeUnsubscribe(lead, sig)

  if (!result.ok) {
    // Invalid signature or unknown lead — reject silently per RFC 8058
    return new Response('', { status: 400 })
  }

  // RFC 8058 §3.2: respond with 200 or 204, no body
  return new Response('', { status: 200 })
}
