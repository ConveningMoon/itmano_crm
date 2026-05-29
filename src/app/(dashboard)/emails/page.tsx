import Link from 'next/link'
import { listSequences } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { Mail, CheckCircle, XCircle, Clock } from 'lucide-react'

function delayLabel(hours: number): string {
  if (hours === 0) return 'Inmediato'
  if (hours < 24)  return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export default async function EmailsPage() {
  const { tenant_id } = await getCurrentTenantContext()
  const sequences = await listSequences(tenant_id ?? '')

  return (
    <>
      <style>{`
        .seq-card { transition: border-color 0.15s; }
        .seq-card:hover { border-color: var(--accent-gold-dim) !important; }
        .seq-link { text-decoration: none; }
        .seq-link:hover .seq-name { color: var(--accent-gold) !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Secuencias de Email
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {sequences.length} {sequences.length === 1 ? 'secuencia activa' : 'secuencias'} · El envío se activa en Fase 3 (Resend)
        </p>
      </div>

      {sequences.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          padding: '48px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}>
          No hay secuencias configuradas todavía.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sequences.map(seq => (
            <Link key={seq.id} href={`/emails/${seq.id}`} className="seq-link" style={{ textDecoration: 'none' }}>
              <div className="seq-card" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                {/* Card header */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: 'rgba(201,169,110,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Mail size={15} color="var(--accent-gold)" />
                    </div>
                    <div>
                      <div className="seq-name" style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {seq.name}
                      </div>
                      {seq.channels.length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {seq.channels.map((ch, i) => (
                            <span key={ch.id}>
                              {i > 0 && <span style={{ marginRight: '4px' }}>,</span>}
                              <Link
                                href={`/sources/${ch.slug}`}
                                onClick={e => e.stopPropagation()}
                                style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}
                              >
                                {ch.name}
                              </Link>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 500,
                      color: seq.active ? 'var(--accent-green)' : 'var(--text-muted)',
                      background: seq.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
                      padding: '2px 8px', borderRadius: '10px',
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>
                      {seq.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>

                {/* Steps timeline */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    {seq.stepCount} {seq.stepCount === 1 ? 'paso' : 'pasos'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                    {seq.steps.map((step, i) => (
                      <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                        }}>
                          <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>
                            {delayLabel(step.delayHours)}
                          </span>
                          {step.subject
                            ? (step.subject.length > 30 ? step.subject.slice(0, 30) + '…' : step.subject)
                            : (step.resendTemplateId ? step.resendTemplateId.slice(0, 20) + '…' : 'Sin asunto')}
                        </div>
                        {i < seq.steps.length - 1 && (
                          <span style={{ color: 'var(--border-subtle)', fontSize: '10px' }}>→</span>
                        )}
                      </div>
                    ))}
                    {seq.steps.length === 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Sin pasos configurados
                      </span>
                    )}
                  </div>
                </div>

                {/* Run stats */}
                <div style={{ padding: '12px 20px', display: 'flex', gap: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={12} color="var(--accent-gold)" />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{seq.activeRunCount}</strong> activos
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle size={12} color="var(--accent-green)" />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{seq.completedRunCount}</strong> completados
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <XCircle size={12} color="var(--accent-coral)" />
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{seq.cancelledRunCount}</strong> cancelados
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
