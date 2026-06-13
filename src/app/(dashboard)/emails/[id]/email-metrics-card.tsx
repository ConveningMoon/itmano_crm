import { getSequenceMetrics } from '@/lib/services/email-metrics'
import { Send, MousePointer2, MessageCircle, AlertCircle, UserMinus } from 'lucide-react'

interface Props {
  sequenceId: string
  tenantId:   string
}

export async function EmailMetricsCard({ sequenceId }: Props) {
  const m = await getSequenceMetrics(sequenceId)

  const stats = [
    {
      label: 'Enviados',
      value: m.totalSends > 0 ? String(m.totalSends) : '0',
      sub:   m.uniqueLeads > 0 ? `${m.uniqueLeads} leads únicos` : undefined,
      icon:  <Send size={14} />,
      color: 'var(--accent-gold)',
      isRate: false,
    },
    {
      label: 'Click rate',
      value: `${m.clickRate}%`,
      icon:  <MousePointer2 size={14} />,
      color: 'var(--accent-blue)',
      isRate: true,
    },
    {
      label: 'Reply rate',
      value: `${m.replyRate}%`,
      icon:  <MessageCircle size={14} />,
      color: 'var(--accent-green)',
      isRate: true,
    },
    {
      label: 'Bounce rate',
      value: `${m.bounceRate}%`,
      icon:  <AlertCircle size={14} />,
      color: m.bounceRate > 5 ? 'var(--accent-coral)' : 'var(--text-muted)',
      isRate: true,
    },
    {
      label: 'Unsub rate',
      value: `${m.unsubscribeRate}%`,
      icon:  <UserMinus size={14} />,
      color: m.unsubscribeRate > 3 ? 'var(--accent-coral)' : 'var(--text-muted)',
      isRate: true,
    },
  ]

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', overflow: 'hidden', marginBottom: '20px',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Send size={14} color="var(--accent-gold)" />
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Métricas de envío
        </span>
      </div>

      {m.totalSends === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
            Aún no se han enviado emails de esta secuencia.
            Las métricas aparecerán aquí cuando empiece a enviar.
          </p>
        </div>
      ) : (
        // 5-metric strip with divider borders — on phones it scrolls sideways
        // (keeps the columns intact) instead of wrapping awkwardly. Desktop unchanged.
        <div className="max-md:overflow-x-auto">
        <div className="max-md:min-w-[520px]" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '16px 20px', gap: '0' }}>
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              style={{
                paddingLeft:  i > 0 ? '16px' : undefined,
                paddingRight: i < stats.length - 1 ? '16px' : undefined,
                borderLeft:   i > 0 ? '1px solid var(--border-subtle)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px', color: stat.color }}>
                {stat.icon}
                <span style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  {stat.label}
                </span>
              </div>
              <div style={{ fontSize: '22px', fontWeight: 600, color: stat.isRate && stat.value === '0%' ? 'var(--text-muted)' : stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              {stat.sub && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>{stat.sub}</div>
              )}
            </div>
          ))}
        </div>
        </div>
      )}
    </div>
  )
}
