import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSequenceWithRuns } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { SequenceDetailActions } from './sequence-detail-actions'
import { StepManager } from './step-manager'
import { ManualLeadPicker, type PickerLead } from './manual-lead-picker'
import { ArrowLeft, Clock, CheckCircle, XCircle, AlertCircle, UserPlus } from 'lucide-react'

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_COLOR: Record<string, string> = {
  es: 'var(--accent-gold)',
  en: 'var(--accent-blue)',
  pt: 'var(--accent-teal)',
}

const RUN_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  active:    { label: 'Activo',     color: 'var(--accent-gold)',  bg: 'rgba(201,169,110,0.12)' },
  completed: { label: 'Completado', color: 'var(--accent-green)', bg: 'rgba(107,163,104,0.12)' },
  cancelled: { label: 'Cancelado',  color: 'var(--accent-coral)', bg: 'rgba(201,123,107,0.12)' },
  paused:    { label: 'Pausado',    color: 'var(--text-muted)',    bg: 'var(--bg-elevated)'     },
}

const CANCEL_LABEL: Record<string, string> = {
  unsubscribed:     'Se dio de baja',
  replied:          'Respondió',
  lead_closed:      'Lead cerrado',
  manual:           'Manual',
  sequence_deleted: 'Secuencia eliminada',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export default async function EmailSequenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { tenant_id, role } = await getCurrentTenantContext()
  const isSuperAdmin = role === 'super_admin'

  const sequence = await getSequenceWithRuns(tenant_id, id)
  if (!sequence) notFound()

  const totalRuns = sequence.activeRunCount + sequence.completedRunCount + sequence.cancelledRunCount

  // For manual sequences: fetch leads eligible to be added (exclude those with active run in this seq)
  let eligibleLeads: PickerLead[] = []
  if (sequence.activationType === 'manual') {
    const supabase = createAdminClient()
    const [leadsRes, activeRunsRes] = await Promise.all([
      (() => {
        let q = supabase.from('leads').select('id, first_name, last_name, email').order('created_at', { ascending: false })
        if (tenant_id) q = q.eq('tenant_id', tenant_id)
        return q
      })(),
      supabase.from('lead_sequence_runs').select('lead_id').eq('sequence_id', id).eq('status', 'active'),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeLeadIds = new Set((activeRunsRes.data ?? []).map((r: any) => r.lead_id as string))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eligibleLeads = (leadsRes.data ?? []).filter((l: any) => !activeLeadIds.has(l.id as string)).map((l: any) => ({
      id:        l.id as string,
      firstName: l.first_name as string,
      lastName:  l.last_name as string,
      email:     l.email as string,
    }))
  }

  return (
    <>
      {/* Back nav */}
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/emails"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} />
          Secuencias de Email
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {sequence.name}
            </h1>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: LANG_COLOR[sequence.language] ?? 'var(--text-muted)',
              background: `${LANG_COLOR[sequence.language] ?? 'var(--text-muted)'}18`,
            }}>
              {LANG_LABEL[sequence.language] ?? sequence.language}
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: sequence.active ? 'var(--accent-green)' : 'var(--text-muted)',
              background: sequence.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
            }}>
              {sequence.active ? 'Activa' : 'Inactiva'}
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: sequence.activationType === 'manual' ? 'var(--accent-blue)' : 'var(--accent-teal)',
              background: sequence.activationType === 'manual' ? 'rgba(91,142,201,0.12)' : 'rgba(90,175,160,0.12)',
            }}>
              {sequence.activationType === 'manual' ? 'Manual' : 'Formulario'}
            </span>
          </div>
          {isSuperAdmin && sequence.tenantName && (
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                {sequence.tenantName}
              </span>
            </div>
          )}
          {sequence.description && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {sequence.description}
            </p>
          )}
        </div>

        <SequenceDetailActions
          sequenceId={sequence.id}
          sequenceName={sequence.name}
          language={sequence.language}
          description={sequence.description ?? ''}
          active={sequence.active}
          activeRunCount={sequence.activeRunCount}
        />
      </div>

      {/* Run stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Runs activos',    value: sequence.activeRunCount,    icon: <Clock size={14} color="var(--accent-gold)" />,  color: 'var(--accent-gold)' },
          { label: 'Completados',      value: sequence.completedRunCount, icon: <CheckCircle size={14} color="var(--accent-green)" />, color: 'var(--accent-green)' },
          { label: 'Cancelados',       value: sequence.cancelledRunCount, icon: <XCircle size={14} color="var(--accent-coral)" />,   color: 'var(--accent-coral)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            {stat.icon}
            <div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── FASE 4 PLACEHOLDER: Email metrics card ──────────────────────────────
          INSERT HERE: <EmailMetricsCard sequenceId={sequence.id} tenantId={sequence.tenantId} />
          Card shows: Enviados total, Open %, Click %, Reply %, Bounce %, Unsubscribe %
          Fetches from: email_sends JOIN lead_events by lead_id + event_type
      ─────────────────────────────────────────────────────────────────────── */}

      {/* Channels */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Canales asociados
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {sequence.channels.length} {sequence.channels.length === 1 ? 'canal' : 'canales'}
          </span>
        </div>
        {sequence.channels.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Esta secuencia no está vinculada a ningún canal.{' '}
            <Link href="/sources" style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}>
              Vincúlala desde Fuentes →
            </Link>
          </div>
        ) : (
          <div style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {sequence.channels.map(ch => (
              <Link
                key={ch.id}
                href={`/sources/${ch.slug}`}
                style={{
                  fontSize: '12px', color: 'var(--accent-gold)',
                  background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.2)',
                  borderRadius: '6px', padding: '4px 10px', textDecoration: 'none',
                }}
              >
                {ch.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Manual enrollment — only shown for activation_type='manual' */}
      {sequence.activationType === 'manual' && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserPlus size={14} color="var(--accent-blue)" />
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Agregar leads manualmente
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
              {eligibleLeads.length} disponibles
            </span>
          </div>
          <div style={{ padding: '16px 20px' }}>
            {eligibleLeads.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Todos los leads ya tienen un run activo en esta secuencia.
              </p>
            ) : (
              <ManualLeadPicker sequenceId={sequence.id} leads={eligibleLeads} />
            )}
          </div>
        </div>
      )}

      {/* Steps — managed by client island */}
      <div style={{ marginBottom: '20px' }}>
        <StepManager
          sequenceId={sequence.id}
          steps={sequence.steps}
        />
      </div>

      {/* ── FASE 4 PLACEHOLDER: Per-step metrics table ─────────────────────────
          REPLACE the plain step list in StepManager with a version that adds
          inline columns: Enviados | Open % | Click % | Reply %
          These come from a server fetch in this page passed as stepMetrics prop.
      ─────────────────────────────────────────────────────────────────────── */}

      {/* Runs table */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Runs
          </span>
          {totalRuns > 50 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mostrando 50 más recientes</span>
          )}
        </div>

        {sequence.runs.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            <AlertCircle size={20} style={{ marginBottom: '8px', opacity: 0.4 }} color="var(--text-muted)" />
            <div>Ningún lead ha entrado en esta secuencia todavía.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {sequence.activationType === 'manual'
                ? 'Agrega leads desde la sección de arriba.'
                : 'Los runs se crean automáticamente cuando un lead se registra desde un canal vinculado.'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                {['Lead', 'Estado', 'Paso actual', 'Próximo envío', 'Iniciado', 'Último envío'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sequence.runs.map((run, i) => {
                const cfg = RUN_STATUS_CFG[run.status] ?? RUN_STATUS_CFG.paused
                return (
                  <tr key={run.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/leads/${run.leadId}`} style={{ fontSize: '13px', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        {run.leadName}
                      </Link>
                      {run.cancelledReason && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                          {CANCEL_LABEL[run.cancelledReason] ?? run.cancelledReason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {run.status === 'active' ? `Paso ${run.currentStepOrder + 1} / ${sequence.stepCount}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {run.nextSendAt ? formatDate(run.nextSendAt) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {formatDate(run.startedAt)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {run.lastSentAt ? formatDate(run.lastSentAt) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
