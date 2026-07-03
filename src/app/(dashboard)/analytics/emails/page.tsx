import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getGlobalEmailMetrics } from '@/lib/services/email-metrics'
import Link from 'next/link'
import { ArrowLeft, Send, MousePointer2, MessageCircle, AlertCircle, UserMinus, TrendingDown } from 'lucide-react'

const CARD: React.CSSProperties = {
  background:   'var(--bg-surface)',
  border:       '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding:      '20px',
  marginBottom: '20px',
}

function pctColor(val: number, thresholdGood: number, thresholdBad: number, invert = false): string {
  if (invert) {
    if (val <= thresholdGood) return 'var(--accent-green)'
    if (val <= thresholdBad)  return 'var(--accent-gold)'
    return 'var(--accent-coral)'
  }
  if (val >= thresholdGood) return 'var(--accent-green)'
  if (val >= thresholdBad)  return 'var(--accent-gold)'
  return 'var(--text-muted)'
}

export default async function EmailAnalyticsPage() {
  const { tenant_id, role } = await requireTenantContext()
  const isSuperAdmin = role === 'super_admin'
  const metrics = await getGlobalEmailMetrics(tenant_id)

  const kpis = [
    {
      label: 'Total enviados',
      value: String(metrics.totalSends),
      sub:   metrics.uniqueLeads > 0 ? `${metrics.uniqueLeads} leads únicos` : undefined,
      icon:  <Send size={16} />,
      color: 'var(--accent-gold)',
    },
    {
      label: 'Click rate',
      value: `${metrics.clickRate}%`,
      icon:  <MousePointer2 size={16} />,
      color: pctColor(metrics.clickRate, 5, 2),
    },
    {
      label: 'Reply rate',
      value: `${metrics.replyRate}%`,
      icon:  <MessageCircle size={16} />,
      color: pctColor(metrics.replyRate, 3, 1),
    },
    {
      label: 'Bounce rate',
      value: `${metrics.bounceRate}%`,
      icon:  <AlertCircle size={16} />,
      color: pctColor(metrics.bounceRate, 2, 5, true),
    },
    {
      label: 'Unsub rate',
      value: `${metrics.unsubscribeRate}%`,
      icon:  <UserMinus size={16} />,
      color: pctColor(metrics.unsubscribeRate, 1, 3, true),
    },
  ]

  const seqsWithSends = metrics.bySequence.filter(s => s.totalSends > 0)
  const topClick   = [...seqsWithSends].sort((a, b) => b.clickRate        - a.clickRate).slice(0, 3)
  const worstUnsub = [...seqsWithSends].sort((a, b) => b.unsubscribeRate  - a.unsubscribeRate).slice(0, 3)

  return (
    <div style={{ padding: '24px' }}>
      {/* Back nav */}
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/analytics"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} />
          Analítica
        </Link>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Email Analytics
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          {isSuperAdmin ? 'Todos los tenants' : 'Tu tenant'} · basado en envíos reales via Resend
        </p>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" style={{ marginBottom: '24px' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: '10px', padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: kpi.color }}>
              {kpi.icon}
              <span style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                {kpi.label}
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 600, color: kpi.color, lineHeight: 1 }}>
              {kpi.value}
            </div>
            {kpi.sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Per-sequence table */}
      <div style={CARD}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Por secuencia
          </span>
          <Link href="/emails" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
            Gestionar secuencias →
          </Link>
        </div>

        {metrics.bySequence.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No hay secuencias configuradas todavía.
          </p>
        ) : (
          // Dense per-sequence table — redesign deferred to Prompt C; defensive scroll <md.
          <div className="max-md:overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Secuencia', 'Enviados', 'Click %', 'Reply %', 'Bounce %', 'Unsub %'].map((col, i) => (
                  <th key={col} style={{
                    padding: '0 8px 10px', textAlign: i === 0 ? 'left' : 'center',
                    fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.bySequence.map((seq, i) => (
                <tr key={seq.sequenceId} style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <Link href={`/emails/${seq.sequenceId}`} style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {seq.sequenceName}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '13px', color: seq.totalSends > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {seq.totalSends > 0 ? seq.totalSends : '—'}
                  </td>
                  {[
                    { v: seq.clickRate,       good:  5, bad:  2 },
                    { v: seq.replyRate,       good:  3, bad:  1 },
                    { v: seq.bounceRate,      good:  2, bad:  5, inv: true },
                    { v: seq.unsubscribeRate, good:  1, bad:  3, inv: true },
                  ].map((m, j) => (
                    <td key={j} style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {seq.totalSends === 0 ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <span style={{ fontSize: '13px', fontWeight: 500, color: pctColor(m.v, m.good, m.bad, m.inv) }}>
                          {m.v}%
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Performance ranking — only shown when there are sends */}
      {seqsWithSends.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Top click rate */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <MousePointer2 size={14} color="var(--accent-blue)" />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Mejor click rate
              </span>
            </div>
            {topClick.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Sin datos todavía</p>
            ) : (
              topClick.map((seq, i) => (
                <div key={seq.sequenceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '14px', textAlign: 'right' }}>{i + 1}</span>
                    <Link href={`/emails/${seq.sequenceId}`} style={{ fontSize: '12px', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                      {seq.sequenceName}
                    </Link>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-blue)' }}>{seq.clickRate}%</span>
                </div>
              ))
            )}
          </div>

          {/* Worst unsubscribe rate */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <TrendingDown size={14} color="var(--accent-coral)" />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Mayor tasa de unsub
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px' }}>
                revisar
              </span>
            </div>
            {worstUnsub.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Sin datos todavía</p>
            ) : (
              worstUnsub.map((seq, i) => (
                <div key={seq.sequenceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '14px', textAlign: 'right' }}>{i + 1}</span>
                    <Link href={`/emails/${seq.sequenceId}`} style={{ fontSize: '12px', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                      {seq.sequenceName}
                    </Link>
                  </div>
                  <span style={{
                    fontSize: '13px', fontWeight: 600,
                    color: seq.unsubscribeRate > 3 ? 'var(--accent-coral)' : 'var(--text-muted)',
                  }}>
                    {seq.unsubscribeRate}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
