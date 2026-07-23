import { Target, TrendingUp } from 'lucide-react'
import type { BriefingOutcomes } from '@/lib/data/ai-briefings'

// El "loop" del análisis de fit: ¿seguir la recomendación de IA correlaciona con
// que el lead avance? Server component, solo lectura. Centro de control.

const STAT: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: '12px', padding: '18px', flex: 1, minWidth: '180px',
}

export function BriefingOutcomesPanel({ outcomes: o }: { outcomes: BriefingOutcomes }) {
  const hasSample = o.followed > 0 || o.notFollowed > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <Target size={15} color="var(--accent-gold)" />
        Efecto de seguir el briefing de IA — de los leads donde el agente actuó tras la recomendación, cuántos
        avanzaron en el embudo (últimos {o.windowDays} días).
      </div>

      {o.total === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
          Todavía no hay briefings registrados en la ventana. La medición se llena sola a medida que los tenants con
          análisis de IA activado generan briefings y los agentes actúan sobre sus leads.
        </div>
      ) : (
        <>
          {/* Comparación central: siguieron vs. no siguieron */}
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ ...STAT, borderColor: 'rgba(107,163,104,0.35)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px' }}>
                Siguieron la recomendación
              </div>
              <div style={{ fontSize: '30px', fontWeight: 600, color: 'var(--accent-green)', lineHeight: 1 }}>
                {o.rateFollowed !== null ? `${o.rateFollowed}%` : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                avanzó · {o.advancedFollowed}/{o.followed} leads
              </div>
            </div>

            <div style={STAT}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px' }}>
                No siguieron
              </div>
              <div style={{ fontSize: '30px', fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1 }}>
                {o.rateNotFollowed !== null ? `${o.rateNotFollowed}%` : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                avanzó · {o.advancedNotFollowed}/{o.notFollowed} leads
              </div>
            </div>

            <div style={{ ...STAT, background: 'rgba(201,169,110,0.06)', borderColor: 'rgba(201,169,110,0.3)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <TrendingUp size={12} /> Diferencia
              </div>
              <div style={{ fontSize: '30px', fontWeight: 600, color: 'var(--accent-gold)', lineHeight: 1 }}>
                {o.lift !== null ? `${o.lift > 0 ? '+' : ''}${o.lift} pts` : '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                a favor de seguir el briefing
              </div>
            </div>
          </div>

          {/* Contexto de muestra */}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {o.total} {o.total === 1 ? 'briefing' : 'briefings'} en la ventana ·
            {' '}{o.followRate !== null ? `${o.followRate}% con acción del agente` : 'sin acciones registradas'}.
            {hasSample && (o.followed < 10 || o.notFollowed < 10) ? ' Muestra pequeña — el dato se estabiliza con más volumen.' : ''}
          </div>
        </>
      )}
    </div>
  )
}
