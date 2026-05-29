import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSequenceWithRuns } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { ArrowLeft, Mail, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

function delayLabel(hours: number): string {
  if (hours === 0) return 'Inmediato'
  if (hours < 24)  return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    active:    { label: 'Activo',     color: 'var(--accent-gold)',  bg: 'rgba(201,169,110,0.12)' },
    completed: { label: 'Completado', color: 'var(--accent-green)', bg: 'rgba(107,163,104,0.12)' },
    cancelled: { label: 'Cancelado',  color: 'var(--accent-coral)', bg: 'rgba(201,123,107,0.12)' },
    paused:    { label: 'Pausado',    color: 'var(--text-muted)',    bg: 'var(--bg-elevated)'     },
  }
  const c = cfg[status] ?? cfg.paused
  return (
    <span style={{
      fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color: c.color, background: c.bg,
    }}>
      {c.label}
    </span>
  )
}

function CancelReasonLabel({ reason }: { reason: string | null }) {
  if (!reason) return null
  const labels: Record<string, string> = {
    unsubscribed: 'Se dio de baja',
    replied:      'Respondió',
    lead_closed:  'Lead cerrado',
    manual:       'Manual',
  }
  return (
    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
      {labels[reason] ?? reason}
    </span>
  )
}

export default async function EmailSequenceDetailPage({ params }: { params: { id: string } }) {
  const { tenant_id } = await getCurrentTenantContext()
  const sequence = await getSequenceWithRuns(tenant_id ?? '', params.id)
  if (!sequence) notFound()

  const totalRuns = sequence.activeRunCount + sequence.completedRunCount + sequence.cancelledRunCount

  return (
    <>
      {/* Back nav */}
      <div style={{ marginBottom: '20px' }}>
        <Link href="/emails" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={13} />
          Secuencias de Email
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {sequence.name}
            </h1>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: sequence.active ? 'var(--accent-green)' : 'var(--text-muted)',
              background: sequence.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
            }}>
              {sequence.active ? 'Activa' : 'Inactiva'}
            </span>
          </div>
          {sequence.channels.length > 0 && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {sequence.channels.map((ch, i) => (
                <span key={ch.id}>
                  {i > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>,</span>}
                  <Link href={`/sources/${ch.slug}`} style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}>
                    {ch.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Runs activos',     value: sequence.activeRunCount,    icon: <Clock size={14} color="var(--accent-gold)" /> },
          { label: 'Completados',       value: sequence.completedRunCount, icon: <CheckCircle size={14} color="var(--accent-green)" /> },
          { label: 'Cancelados',        value: sequence.cancelledRunCount, icon: <XCircle size={14} color="var(--accent-coral)" /> },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            {stat.icon}
            <div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{stat.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', overflow: 'hidden', marginBottom: '24px',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Pasos de la secuencia
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {sequence.stepCount} {sequence.stepCount === 1 ? 'email' : 'emails'}
          </span>
        </div>
        {sequence.steps.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Sin pasos configurados todavía.
          </div>
        ) : (
          sequence.steps.map((step, i) => (
            <div key={step.id} style={{
              padding: '14px 20px',
              borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
              display: 'flex', alignItems: 'center', gap: '14px',
            }}>
              {/* Step number */}
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 600, color: 'var(--accent-gold)',
                flexShrink: 0,
              }}>
                {step.stepOrder}
              </div>

              {/* Delay */}
              <div style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '6px', padding: '3px 8px',
                fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
                flexShrink: 0,
              }}>
                {delayLabel(step.delayHours)}
              </div>

              {/* Subject */}
              <div style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)' }}>
                {step.subject}
              </div>

              {/* Mail icon */}
              <Mail size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            </div>
          ))
        )}
      </div>

      {/* Runs table */}
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Runs recientes
          </span>
          {totalRuns > 50 && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Mostrando 50 más recientes</span>
          )}
        </div>

        {sequence.runs.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            <AlertCircle size={20} style={{ marginBottom: '8px', opacity: 0.4 }} />
            <div>Ningún lead ha entrado en esta secuencia todavía.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Los runs se crean automáticamente cuando un lead se registra desde la fuente asociada.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Lead', 'Estado', 'Paso actual', 'Iniciado', 'Último envío'].map(h => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sequence.runs.map((run, i) => (
                <tr key={run.id} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                  <td style={{ padding: '12px 20px' }}>
                    <Link href={`/leads/${run.leadId}`} style={{ fontSize: '13px', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                      {run.leadName}
                    </Link>
                    {run.cancelledReason && (
                      <div style={{ marginTop: '2px' }}>
                        <CancelReasonLabel reason={run.cancelledReason} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <StatusBadge status={run.status} />
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {run.status === 'active' ? `Paso ${run.currentStepOrder + 1} / ${sequence.stepCount}` : '—'}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {new Date(run.startedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {run.lastSentAt
                      ? new Date(run.lastSentAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
