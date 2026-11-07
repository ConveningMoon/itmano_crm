import type { AiUsageSummary, AiUsageTotals, AiUsageByFeature, AiUsageRequestRow, AgentAiBreakdown } from '@/lib/data/ai-usage'
import { InfoHint } from '@/components/ui/info-hint'
import { AI_FEATURE_LABELS } from '@/lib/services/ai-feature-labels'
import { Sparkles, ArrowDownToLine, ArrowUpFromLine, DollarSign } from 'lucide-react'

// Piezas del uso de IA (tokens + costo). Presentacionales puras, sin hooks:
// AiUsagePanel es la vista del Centro de control (server) y las tarjetas sueltas
// las compone el tab "Uso de IA" de Configuración (client). Los datos llegan ya
// agregados desde getAiUsageSummary.

// El fallback `?? f` cubre una feature de una fila vieja que ya no exista en
// el mapa: se muestra el literal antes que romper la pantalla.
function featureLabel(f: string): string {
  return AI_FEATURE_LABELS[f] ?? f
}

export function fmtInt(n: number): string {
  return n.toLocaleString('es-419')
}

export function fmtCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-419', { day: 'numeric', month: 'short' }) +
    ' · ' + new Date(iso).toLocaleTimeString('es-419', { hour: '2-digit', minute: '2-digit' })
}

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
}

const TH: React.CSSProperties = {
  fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  padding: '10px 16px', textAlign: 'left',
}

const TD: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-secondary)', padding: '10px 16px',
  borderTop: '1px solid var(--border-subtle)',
}

const NUM: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function KpiCard({ icon, color, label, value, sub }: {
  icon: React.ReactNode
  color: string
  label: string
  value: string
  sub: string
}) {
  return (
    <div style={{ ...CARD, padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: `color-mix(in srgb, ${color} 12%, transparent)`, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>
    </div>
  )
}

function totalsRow(t: AiUsageTotals, showCosts: boolean) {
  return (
    <>
      <td style={NUM}>{fmtInt(t.requests)}</td>
      <td style={NUM}>{fmtInt(t.inputTokens)}</td>
      <td style={NUM}>{fmtInt(t.outputTokens)}</td>
      {showCosts && <td style={{ ...NUM, color: 'var(--accent-gold)', fontWeight: 500 }}>{fmtCost(t.costUsd)}</td>}
    </>
  )
}

function numHeaders(showCosts: boolean) {
  return (
    <>
      <th style={{ ...TH, textAlign: 'right' }}>Requests</th>
      <th style={{ ...TH, textAlign: 'right' }}>Tokens entrada</th>
      <th style={{ ...TH, textAlign: 'right' }}>Tokens salida</th>
      {showCosts && <th style={{ ...TH, textAlign: 'right' }}>Costo</th>}
    </>
  )
}

// Desglose por agente — vista del owner (mes en curso).
export function AiByAgentCard({ byAgent, showCosts }: { byAgent: AgentAiBreakdown | null; showCosts: boolean }) {
  if (!byAgent || byAgent.agents.length === 0) return null
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
        <span>Uso por agente · mes en curso</span>
        <InfoHint label="Qué cuenta el uso por agente">
          Sólo cuenta lo generado por agentes con acceso; los procesos automáticos no se atribuyen a nadie.
        </InfoHint>
        {byAgent.splitApplies && (
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>
            (el límite del equipo se reparte en partes iguales entre {byAgent.agentCount} agentes)
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Agente</th>
              <th style={{ ...TH, textAlign: 'right' }}>Requests</th>
              <th style={{ ...TH, textAlign: 'right' }}>Tokens entrada</th>
              <th style={{ ...TH, textAlign: 'right' }}>Tokens salida</th>
              {showCosts && <th style={{ ...TH, textAlign: 'right' }}>Costo</th>}
              <th style={{ ...TH, width: '190px' }}>
                {byAgent.splitApplies ? 'De su parte del límite' : 'Del uso del equipo'}
              </th>
            </tr>
          </thead>
          <tbody>
            {byAgent.agents.map(a => {
              const ratio = byAgent.splitApplies ? (a.shareRatio ?? 0) : a.ofTeamRatio
              const pct = Math.round(ratio * 100)
              const barColor = byAgent.splitApplies && ratio >= 0.8 ? 'var(--accent-coral)' : a.agentColor
              return (
                <tr key={a.agentId}>
                  <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <span style={{
                      display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                      background: a.agentColor, marginRight: '8px',
                    }} />
                    {a.agentName}
                    {!a.hasLogin && (
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                        sin acceso
                      </span>
                    )}
                  </td>
                  <td style={NUM}>{fmtInt(a.requests)}</td>
                  <td style={NUM}>{fmtInt(a.inputTokens)}</td>
                  <td style={NUM}>{fmtInt(a.outputTokens)}</td>
                  {showCosts && <td style={{ ...NUM, color: 'var(--accent-gold)', fontWeight: 500 }}>{fmtCost(a.costUsd)}</td>}
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', borderRadius: '3px',
                          width: `${Math.min(100, Math.max(a.requests > 0 ? 3 : 0, pct))}%`,
                          background: barColor,
                        }} />
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', width: '38px', textAlign: 'right' }}>
                        {pct}%
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Desglose por función.
export function AiByFeatureCard({ byFeature, showCosts }: { byFeature: AiUsageByFeature[]; showCosts: boolean }) {
  return (
  <div style={CARD}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
      Uso por función
    </div>
    {byFeature.length === 0 ? (
      <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        Aún no hay uso de IA registrado.
      </div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={TH}>Función</th>{numHeaders(showCosts)}</tr></thead>
          <tbody>
            {byFeature.map(f => (
              <tr key={f.feature}>
                <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{featureLabel(f.feature)}</td>
                {totalsRow(f, showCosts)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
  )
}

// Requests recientes.
export function AiRecentCard({ recent, showCosts }: { recent: AiUsageRequestRow[]; showCosts: boolean }) {
  return (
  <div style={CARD}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
      Requests recientes
    </div>
    {recent.length === 0 ? (
      <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
        Aún no hay requests. Cuando se genere contenido con IA (propiedades, correos, secuencias) aparecerá aquí{showCosts ? ' con su costo' : ''}.
      </div>
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={TH}>Fecha</th>
              <th style={TH}>Función</th>
              {recent.some(r => r.tenantName) && <th style={TH}>Tenant</th>}
              <th style={TH}>Modelo</th>
              <th style={{ ...TH, textAlign: 'right' }}>Entrada</th>
              <th style={{ ...TH, textAlign: 'right' }}>Salida</th>
              {showCosts && <th style={{ ...TH, textAlign: 'right' }}>Costo</th>}
            </tr>
          </thead>
          <tbody>
            {recent.map(r => (
              <tr key={r.id}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                <td style={{ ...TD, color: 'var(--text-primary)' }}>{featureLabel(r.feature)}</td>
                {recent.some(x => x.tenantName) && <td style={TD}>{r.tenantName ?? '—'}</td>}
                <td style={{ ...TD, fontFamily: 'monospace', fontSize: '11px' }}>{r.model}</td>
                <td style={NUM}>{fmtInt(r.inputTokens)}</td>
                <td style={NUM}>{fmtInt(r.outputTokens)}</td>
                {showCosts && <td style={{ ...NUM, color: 'var(--accent-gold)' }}>{fmtCost(r.costUsd)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
  )
}

// Cómo se calcula el uso. Con costos (super_admin), la tarifa del modelo; sin
// ellos, cómo funciona el límite del equipo. Una sola fuente para el Centro de
// control y para Configuración → "Uso de IA".
export function AiCostExplanation({ showCosts }: { showCosts: boolean }) {
  return showCosts ? (
    <>
      El costo se calcula con los tokens reales de cada request y la tarifa vigente del modelo
      (claude-sonnet-5: $3 por millón de tokens de entrada · $15 por millón de salida). Los adjuntos
      (p. ej. el PDF de un lead magnet) aumentan los tokens de entrada, por eso esas generaciones
      cuestan más.
    </>
  ) : (
    <>
      Cada generación con IA (propiedades, correos, secuencias) consume parte del límite mensual del
      equipo. Los documentos adjuntos consumen más. El contador se reinicia el día 1 de cada mes; si
      necesitas ampliar el límite, contacta a ITMANO.
    </>
  )
}

// Vista global del Centro de control (sólo super_admin, siempre con costos).
// Los requests recientes no van aquí: el hub muestra el diagrama diario en su
// lugar. Configuración compone sus propias tarjetas (AiUsageSection).
export function AiUsagePanel({ summary }: { summary: AiUsageSummary }) {
  const { allTime, last30d, byFeature, byTenant } = summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* KPIs — últimos 30 días, con el histórico como subtítulo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Sparkles size={14} />}
          color="var(--accent-gold)"
          label="Requests · 30 días"
          value={fmtInt(last30d.requests)}
          sub={`${fmtInt(allTime.requests)} en total`}
        />
        <KpiCard
          icon={<ArrowDownToLine size={14} />}
          color="var(--accent-blue)"
          label="Tokens entrada · 30 días"
          value={fmtInt(last30d.inputTokens)}
          sub={`${fmtInt(allTime.inputTokens)} en total`}
        />
        <KpiCard
          icon={<ArrowUpFromLine size={14} />}
          color="var(--accent-teal)"
          label="Tokens salida · 30 días"
          value={fmtInt(last30d.outputTokens)}
          sub={`${fmtInt(allTime.outputTokens)} en total`}
        />
        <KpiCard
          icon={<DollarSign size={14} />}
          color="var(--accent-green)"
          label="Costo · 30 días"
          value={fmtCost(last30d.costUsd)}
          sub={`${fmtCost(allTime.costUsd)} en total`}
        />
      </div>

      {/* Desglose por tenant */}
      {byTenant && byTenant.length > 0 && (
        <div style={CARD}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Uso por tenant
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Tenant</th>{numHeaders(true)}</tr></thead>
              <tbody>
                {byTenant.map(t => (
                  <tr key={t.tenantId ?? 'none'}>
                    <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{t.tenantName}</td>
                    {totalsRow(t, true)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AiByFeatureCard byFeature={byFeature} showCosts />

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        <AiCostExplanation showCosts />
      </p>
    </div>
  )
}
