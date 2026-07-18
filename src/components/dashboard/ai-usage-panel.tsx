import type { AiUsageSummary, AiUsageTotals, AgentAiBreakdown } from '@/lib/data/ai-usage'
import { Sparkles, ArrowDownToLine, ArrowUpFromLine, DollarSign } from 'lucide-react'

// Panel de uso de IA (tokens + costo). Componente presentacional puro, sin
// hooks: lo renderiza el Centro de control (server) y el tab "Uso de IA" de
// Configuración (dentro del client de settings). Los datos llegan ya agregados
// desde getAiUsageSummary.

// Labels client-safe (duplicados a propósito del service server-only).
const FEATURE_LABELS: Record<string, string> = {
  property_intake:    'Propiedades · Crear con IA',
  email_draft:        'Correos · Borrador con IA',
  sequence_bootstrap: 'Secuencias · 3 correos con IA',
  hosted_page_copy:   'Páginas · Textos con IA',
}

function featureLabel(f: string): string {
  return FEATURE_LABELS[f] ?? f
}

function fmtInt(n: number): string {
  return n.toLocaleString('es-419')
}

function fmtCost(v: number): string {
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

// Estado del límite mensual SIN montos (misma forma que AiLimitIndicator).
export interface AiUsageLimitView {
  unlimited: boolean
  usedRatio: number
  blocked:   boolean
}

// showCosts: los montos en USD (costo por request, tarifas) son información
// interna de ITMANO — true solo para el super_admin (Centro de control).
// Los usuarios del tenant ven requests/tokens y su límite como porcentaje.
// byAgent: desglose por agente del mes en curso (vista del owner). showRecent:
// el Centro de control lo apaga y muestra el diagrama diario en su lugar.
export function AiUsagePanel({ summary, showCosts = true, limit = null, limitSubtitle, byAgent = null, showRecent = true }: {
  summary: AiUsageSummary
  showCosts?: boolean
  limit?: AiUsageLimitView | null
  limitSubtitle?: string
  byAgent?: AgentAiBreakdown | null
  showRecent?: boolean
}) {
  const { allTime, last30d, byFeature, byTenant, recent } = summary

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
        {showCosts ? (
          <KpiCard
            icon={<DollarSign size={14} />}
            color="var(--accent-green)"
            label="Costo · 30 días"
            value={fmtCost(last30d.costUsd)}
            sub={`${fmtCost(allTime.costUsd)} en total`}
          />
        ) : limit ? (
          <div style={{ ...CARD, padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'color-mix(in srgb, var(--accent-green) 12%, transparent)', color: 'var(--accent-green)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={14} />
              </div>
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500 }}>
                Límite mensual
              </span>
            </div>
            {limit.unlimited ? (
              <div style={{ fontSize: '24px', fontWeight: 500, color: 'var(--accent-teal)', lineHeight: 1.1 }}>Ilimitado</div>
            ) : (
              <>
                <div style={{ fontSize: '24px', fontWeight: 500, color: limit.blocked ? 'var(--accent-coral)' : 'var(--text-primary)', lineHeight: 1.1 }}>
                  {Math.round(limit.usedRatio * 100)}%
                </div>
                <div style={{ marginTop: '8px', height: '5px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    width: `${Math.max(3, Math.round(limit.usedRatio * 100))}%`,
                    background: limit.blocked || limit.usedRatio >= 0.8 ? 'var(--accent-coral)' : 'var(--accent-gold)',
                  }} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {limit.blocked
                    ? 'Límite alcanzado — se reinicia el día 1'
                    : (limitSubtitle ?? 'del límite del mes utilizado')}
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Desglose por tenant — solo vista global (super_admin) */}
      {byTenant && byTenant.length > 0 && (
        <div style={CARD}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Uso por tenant
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Tenant</th>{numHeaders(showCosts)}</tr></thead>
              <tbody>
                {byTenant.map(t => (
                  <tr key={t.tenantId ?? 'none'}>
                    <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{t.tenantName}</td>
                    {totalsRow(t, showCosts)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desglose por agente — vista del owner (mes en curso) */}
      {byAgent && byAgent.agents.length > 0 && (
        <div style={CARD}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Uso por agente · mes en curso
            {byAgent.splitApplies && (
              <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>
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
      )}

      {/* Desglose por función */}
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

      {/* Requests recientes */}
      {showRecent && (
      <div style={CARD}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Requests recientes
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
            Aún no hay requests. Cuando se genere contenido con IA (propiedades, correos, secuencias) aparecerá aquí con su costo.
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
      )}

      {showCosts ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          El costo se calcula con los tokens reales de cada request y la tarifa vigente del modelo
          (claude-sonnet-5: $3 por millón de tokens de entrada · $15 por millón de salida). Los adjuntos
          (p. ej. el PDF de un lead magnet) aumentan los tokens de entrada — por eso esas generaciones
          cuestan más.
        </p>
      ) : (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Cada generación con IA (propiedades, correos, secuencias) consume parte del límite mensual del
          equipo. Los documentos adjuntos consumen más. El contador se reinicia el día 1 de cada mes; si
          necesitas ampliar el límite, contacta a ITMANO.
        </p>
      )}
    </div>
  )
}
