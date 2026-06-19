import { createAdminClient } from '@/lib/supabase/admin'
import { verifyUnsubscribeSignature } from '@/lib/services/unsubscribe-url'

export const metadata = { title: 'Darse de baja — ITMANO' }

// ─── Shared layout ────────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        padding: '48px 36px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        textAlign: 'center',
      }}>
        {children}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', letterSpacing: '0.08em' }}>
          ITMANO CRM
        </div>
      </div>
    </div>
  )
}

// ─── Error page ───────────────────────────────────────────────────────────────

function ErrorPage() {
  return (
    <PageShell>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="var(--accent-coral)" strokeWidth="1.5" />
        <path d="M15 9l-6 6M9 9l6 6" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div>
        <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Este enlace no es válido
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.6' }}>
          Si deseas darte de baja, responde directamente al correo que recibiste.
        </p>
      </div>
    </PageShell>
  )
}

// ─── Success page ─────────────────────────────────────────────────────────────

function SuccessPage({ tenantName, agentEmail }: { tenantName: string; agentEmail: string }) {
  return (
    <PageShell>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="var(--accent-green)" strokeWidth="1.5" />
        <path d="M8 12l3 3 5-5" stroke="var(--accent-green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <p style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Te has dado de baja
        </p>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: '1.6' }}>
          Ya no recibirás más correos de <strong style={{ color: 'var(--text-primary)' }}>{tenantName}</strong>.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.6' }}>
          Si fue un error, escríbenos a{' '}
          <a
            href={`mailto:${agentEmail}`}
            style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}
          >
            {agentEmail}
          </a>
          .
        </p>
      </div>
    </PageShell>
  )
}

// ─── Route handler ────────────────────────────────────────────────────────────

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const lead = typeof params.lead === 'string' ? params.lead : null
  const sig  = typeof params.sig  === 'string' ? params.sig  : null

  if (!lead || !sig || !verifyUnsubscribeSignature(lead, sig)) {
    return <ErrorPage />
  }

  const db = createAdminClient()

  // Resolve lead → tenant + agent for the confirmation copy
  const { data: leadRow } = await db
    .from('leads')
    .select('id, tenant_id, agent_id')
    .eq('id', lead)
    .maybeSingle()

  if (!leadRow) return <ErrorPage />

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

  // 23505 = already unsubscribed — idempotent, show success regardless
  if (insertError && insertError.code !== '23505') {
    console.error(JSON.stringify({
      service:  'unsubscribe-page',
      lead_id:  leadRow.id,
      error:    insertError.message,
    }))
    return <ErrorPage />
  }

  // Set persistent block flag — independent of scoring; idempotent (UPDATE is a no-op
  // if already set). Best-effort: a failure here still shows the success page since
  // the lead_event (the source of truth for scoring) was already inserted.
  await db
    .from('leads')
    .update({ email_blocked: true, email_blocked_reason: 'unsubscribed' })
    .eq('id', leadRow.id)

  return <SuccessPage tenantName={tenantName} agentEmail={agentEmail} />
}
