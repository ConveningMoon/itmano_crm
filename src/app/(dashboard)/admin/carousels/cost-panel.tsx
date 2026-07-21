'use client'

import { DollarSign, Image as ImageIcon, Layers, Sparkles } from 'lucide-react'
import type { CarouselCostReport } from '@/lib/data/carousels'

// Costo por proceso de creación de carrusel. El copy (Claude) es costo REAL
// (de ai_usage_events); investigación (Gemini) e imágenes (Nano Banana) van al
// free tier de Google → se muestran como ESTIMADO con tarifas aproximadas.

function fmtCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return `$${v.toFixed(4)}`
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('es-419', { day: 'numeric', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('es-419', { hour: '2-digit', minute: '2-digit' })
}

const CARD: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }
const TH: React.CSSProperties = { fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 16px', textAlign: 'left' }
const TD: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }
const NUM: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function Kpi({ icon, color, label, value, sub }: { icon: React.ReactNode; color: string; label: string; value: string; sub: string }) {
  return (
    <div style={{ ...CARD, padding: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `color-mix(in srgb, ${color} 12%, transparent)`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{sub}</div>
    </div>
  )
}

export function CostPanel({ report }: { report: CarouselCostReport }) {
  const avg = report.carousels > 0 ? report.totalEstUsd / report.carousels : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={<DollarSign size={14} />} color="var(--accent-green)" label="Costo total aprox." value={fmtCost(report.totalEstUsd)} sub={`copy real ${fmtCost(report.totalCopyUsd)} + estimados`} />
        <Kpi icon={<Sparkles size={14} />} color="var(--accent-gold)" label="Costo por carrusel" value={fmtCost(avg)} sub="promedio aproximado" />
        <Kpi icon={<Layers size={14} />} color="var(--accent-blue)" label="Carruseles" value={String(report.carousels)} sub="registrados" />
        <Kpi icon={<ImageIcon size={14} />} color="var(--accent-teal)" label="Imágenes IA" value={String(report.totalImages)} sub="Nano Banana generadas" />
      </div>

      {/* Desglose por API / acción */}
      <div style={CARD}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Desglose por API y acción
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>API</th>
                <th style={TH}>Acción</th>
                <th style={TH}>Modelo</th>
                <th style={TH}>Facturación</th>
                <th style={{ ...TH, textAlign: 'right' }}>Requests</th>
                <th style={{ ...TH, textAlign: 'right' }}>Entrada</th>
                <th style={{ ...TH, textAlign: 'right' }}>Salida</th>
                <th style={{ ...TH, textAlign: 'right' }}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {report.byApi.map((a) => (
                <tr key={`${a.provider}-${a.action}`}>
                  <td style={{ ...TD, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{a.provider}</td>
                  <td style={TD}>{a.action}</td>
                  <td style={{ ...TD, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{a.model}</td>
                  <td style={TD}>
                    <span style={{
                      fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '6px',
                      color: a.billing === 'real' ? 'var(--accent-green)' : 'var(--text-muted)',
                      background: a.billing === 'real' ? 'color-mix(in srgb, var(--accent-green) 14%, transparent)' : 'var(--bg-elevated)',
                    }}>
                      {a.billing === 'real' ? 'Real' : 'Estimado'}
                    </span>
                  </td>
                  <td style={NUM}>{a.requests}</td>
                  <td style={NUM}>{a.inputTokens !== undefined ? a.inputTokens.toLocaleString('es-419') : '—'}</td>
                  <td style={NUM}>{a.outputTokens !== undefined ? a.outputTokens.toLocaleString('es-419') : '—'}</td>
                  <td style={{ ...NUM, color: 'var(--accent-gold)', fontWeight: 500 }}>{fmtCost(a.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Costo por carrusel
        </div>
        {report.rows.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
            Aún no se ha generado ningún carrusel. Cuando generes uno, aquí verás el costo del copy (real) y una estimación de imágenes e investigación.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={TH}>Fecha</th>
                  <th style={TH}>Tema</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Copy (real)</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Imágenes (est.)</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Investig. (est.)</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total aprox.</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.jobId}>
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                    <td style={{ ...TD, color: 'var(--text-primary)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.topic || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={NUM}>{fmtCost(r.copyCostUsd)}</td>
                    <td style={NUM}>{r.imageCount > 0 ? `${fmtCost(r.imageEstUsd)} · ${r.imageCount}` : '—'}</td>
                    <td style={NUM}>{r.researchEstUsd > 0 ? fmtCost(r.researchEstUsd) : '—'}</td>
                    <td style={{ ...NUM, color: 'var(--accent-gold)', fontWeight: 500 }}>{fmtCost(r.totalEstUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        El <strong>copy</strong> se genera con la Claude API y su costo es real, calculado con los tokens de
        cada request (registrado en el uso de IA de ITMANO). La <strong>investigación</strong> (Gemini) y las
        <strong> imágenes</strong> (Nano Banana) usan el free tier de Google AI Studio; aquí se muestran como
        estimación con tarifas aproximadas (~{fmtCost(0.039)} por imagen, ~{fmtCost(0.003)} por investigación) para dar una
        referencia — no se facturan a la cuenta de Anthropic.
      </p>
    </div>
  )
}
