import { Sparkles } from 'lucide-react'
import type { LeadFitUsageSummary } from '@/lib/data/ai-usage'

// Panel del consumo del análisis de fit con IA por lead (centro de control).
// Server component: solo lectura. El costo se muestra con 4 decimales (los
// análisis cuestan fracciones de centavo con Haiku).

function usd(n: number): string {
  return `$${n.toFixed(n < 0.01 ? 5 : 4)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const CELL: React.CSSProperties = { padding: '10px 12px', fontSize: '12.5px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }
const HEAD: React.CSSProperties = { padding: '10px 12px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }

export function LeadFitPanel({ summary }: { summary: LeadFitUsageSummary }) {
  const stats = [
    { label: 'Análisis totales', value: String(summary.count) },
    { label: 'Costo total', value: usd(summary.totalCostUsd) },
    { label: 'Costo por análisis (prom.)', value: usd(summary.avgCostUsd) },
    { label: 'Últimos 30 días', value: `${summary.last30dCount} · ${usd(summary.last30dCostUsd)}` },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
        <Sparkles size={15} color="var(--accent-gold)" />
        Costo de cada análisis de fit con IA por lead. Se ejecuta solo en tenants con el análisis activado.
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      {summary.rows.length === 0 ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)', borderRadius: '12px', padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Aún no hay análisis de fit con IA. Activa el análisis en un tenant para empezar a verlos.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
              <thead>
                <tr>
                  <th style={HEAD}>Lead</th>
                  <th style={HEAD}>Tenant</th>
                  <th style={HEAD}>Tokens (in/out)</th>
                  <th style={{ ...HEAD, textAlign: 'right' }}>Costo</th>
                  <th style={{ ...HEAD, textAlign: 'right' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...CELL, color: 'var(--text-primary)', fontWeight: 500 }}>{r.leadName}</td>
                    <td style={CELL}>{r.tenantName ?? '—'}</td>
                    <td style={CELL}>{r.inputTokens.toLocaleString('es')} / {r.outputTokens.toLocaleString('es')}</td>
                    <td style={{ ...CELL, textAlign: 'right', color: 'var(--accent-gold)', fontWeight: 500 }}>{usd(r.costUsd)}</td>
                    <td style={{ ...CELL, textAlign: 'right', color: 'var(--text-muted)' }}>{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
