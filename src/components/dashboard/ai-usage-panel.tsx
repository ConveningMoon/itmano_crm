import type { AiUsageSummary, AiUsageTotals } from '@/lib/data/ai-usage'
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

function totalsRow(t: AiUsageTotals) {
  return (
    <>
      <td style={NUM}>{fmtInt(t.requests)}</td>
      <td style={NUM}>{fmtInt(t.inputTokens)}</td>
      <td style={NUM}>{fmtInt(t.outputTokens)}</td>
      <td style={{ ...NUM, color: 'var(--accent-gold)', fontWeight: 500 }}>{fmtCost(t.costUsd)}</td>
    </>
  )
}

const NUM_HEADERS = (
  <>
    <th style={{ ...TH, textAlign: 'right' }}>Requests</th>
    <th style={{ ...TH, textAlign: 'right' }}>Tokens entrada</th>
    <th style={{ ...TH, textAlign: 'right' }}>Tokens salida</th>
    <th style={{ ...TH, textAlign: 'right' }}>Costo</th>
  </>
)

export function AiUsagePanel({ summary }: { summary: AiUsageSummary }) {
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
        <KpiCard
          icon={<DollarSign size={14} />}
          color="var(--accent-green)"
          label="Costo · 30 días"
          value={fmtCost(last30d.costUsd)}
          sub={`${fmtCost(allTime.costUsd)} en total`}
        />
      </div>

      {/* Desglose por tenant — solo vista global (super_admin) */}
      {byTenant && byTenant.length > 0 && (
        <div style={CARD}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Uso por tenant
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={TH}>Tenant</th>{NUM_HEADERS}</tr></thead>
              <tbody>
                {byTenant.map(t => (
                  <tr key={t.tenantId ?? 'none'}>
                    <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{t.tenantName}</td>
                    {totalsRow(t)}
                  </tr>
                ))}
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
              <thead><tr><th style={TH}>Función</th>{NUM_HEADERS}</tr></thead>
              <tbody>
                {byFeature.map(f => (
                  <tr key={f.feature}>
                    <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500 }}>{featureLabel(f.feature)}</td>
                    {totalsRow(f)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Requests recientes */}
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
                  <th style={{ ...TH, textAlign: 'right' }}>Costo</th>
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
                    <td style={{ ...NUM, color: 'var(--accent-gold)' }}>{fmtCost(r.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        El costo se calcula con los tokens reales de cada request y la tarifa vigente del modelo
        (claude-sonnet-5: $3 por millón de tokens de entrada · $15 por millón de salida). Los adjuntos
        (p. ej. el PDF de un lead magnet) aumentan los tokens de entrada — por eso esas generaciones
        cuestan más.
      </p>
    </div>
  )
}
