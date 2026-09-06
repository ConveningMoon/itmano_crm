import Link from 'next/link'
import { listSequences } from '@/lib/data/email-sequences'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { SequenceListActions } from './sequence-list-actions'
import { getAllPurchaseTemplatesByTenant, getPurchaseTemplatesByAgent } from './purchase-templates-actions'
import { PurchaseTemplatesPanel } from './purchase-templates-panel'
import { getMetricsForSequences } from '@/lib/services/email-metrics'
import { Plus, Mail } from 'lucide-react'

// Una sola definición de columnas para la cabecera y las filas: si divergen, la
// tabla se desalinea sin que nada falle.
const GRID_COLUMNS = '2fr 96px 56px 64px 76px 76px 72px 72px 72px 72px 88px 116px'
const GRID_MIN_WIDTH = '1180px'

// Mismos criterios que la tarjeta del detalle (email-metrics-card): un 0% no se
// pinta de color —no hay nada que celebrar ni que alarmar— y rebotes o bajas por
// encima del umbral sano se marcan en coral.
function rateColor(value: number, opts: { alertOver?: number; color: string }): string {
  if (opts.alertOver !== undefined && value > opts.alertOver) return 'var(--accent-coral)'
  return value === 0 ? 'var(--text-muted)' : opts.color
}

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_COLOR: Record<string, string> = {
  es: 'var(--accent-gold)',
  en: 'var(--accent-blue)',
  pt: 'var(--accent-teal)',
}

export default async function EmailsPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)
  const [sequences, purchaseByTenant, ownAgentTemplates] = await Promise.all([
    listSequences(tenant_id, scope.agentId),
    isSuperAdmin ? getAllPurchaseTemplatesByTenant() : Promise.resolve([]),
    // Emails de cierre por agente (058): owner ve todos los agentes del tenant;
    // rol 'agent' solo los suyos (el filtro lo refuerza la propia action).
    !isSuperAdmin && tenant_id
      ? getPurchaseTemplatesByAgent(tenant_id, { agentId: scope.agentId })
      : Promise.resolve([]),
  ])

  // Las mismas métricas de la tarjeta del detalle, para cada fila. Batcheado:
  // una llamada por secuencia serían 3 queries por fila leyendo los mismos datos.
  const metrics = await getMetricsForSequences(sequences.map(s => s.id))

  return (
    <>
      <style>{`
        .seq-row { transition: background 0.1s; }
        .seq-row:hover { background: var(--bg-elevated) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
            Secuencias de Email
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {sequences.length} {sequences.length === 1 ? 'secuencia' : 'secuencias'}
          </p>
        </div>
        <Link
          href="/emails/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', fontSize: '13px', fontWeight: 500,
            background: 'var(--accent-gold)', color: 'var(--bg-base)',
            borderRadius: '8px', textDecoration: 'none', border: 'none',
          }}
        >
          <Plus size={14} />
          Nueva Secuencia
        </Link>
      </div>

      {sequences.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '64px 48px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(201,169,110,0.1)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Sin secuencias configuradas
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px' }}>
            Crea tu primera secuencia para empezar a nutrir leads automáticamente con emails enviados por Resend.
          </div>
          <Link
            href="/emails/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', textDecoration: 'none',
            }}
          >
            <Plus size={13} />
            Crear primera secuencia
          </Link>
        </div>
      ) : (
        // La tabla creció con las métricas: en pantallas estrechas se desplaza
        // de lado en vez de aplastar las columnas.
        <div className="overflow-x-auto" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
          <div style={{ minWidth: GRID_MIN_WIDTH }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: GRID_COLUMNS,
            padding: '10px 20px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {[
              'Nombre',
              'Idioma',
              'Pasos',
              'Canales',
              'Runs activos',
              'Enviados',
              'Click rate',
              'Reply rate',
              'Bounce rate',
              'Unsub rate',
              'Estado',
              'Acciones',
            ].map(h => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {h}
              </span>
            ))}
          </div>

          {sequences.map((seq, i) => {
            const m = metrics.get(seq.id)
            return (
            <div
              key={seq.id}
              className="seq-row"
              style={{
                display: 'grid',
                gridTemplateColumns: GRID_COLUMNS,
                padding: '14px 20px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
                alignItems: 'center',
                background: 'var(--bg-surface)',
              }}
            >
              {/* Name + tenant + channel list */}
              <div>
                <Link
                  href={`/emails/${seq.id}`}
                  style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
                >
                  {seq.name}
                </Link>
                <div style={{ marginTop: '2px' }}>
                  <span style={{
                    fontSize: '10px', padding: '1px 7px', borderRadius: '4px',
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  }}>
                    {seq.agentName ?? 'Toda la agencia'}
                  </span>
                </div>
                {isSuperAdmin && seq.tenantName && (
                  <div style={{ marginTop: '2px' }}>
                    <span style={{
                      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                      background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
                    }}>
                      {seq.tenantName}
                    </span>
                  </div>
                )}
                {seq.channels.length > 0 && (
                  <div style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {seq.channels.map(ch => ch.name).join(', ')}
                  </div>
                )}
              </div>

              {/* Language */}
              <span style={{
                fontSize: '11px', fontWeight: 500,
                color: LANG_COLOR[seq.language] ?? 'var(--text-muted)',
                background: `${LANG_COLOR[seq.language] ?? 'var(--text-muted)'}18`,
                padding: '2px 8px', borderRadius: '10px',
                letterSpacing: '0.04em', width: 'fit-content',
              }}>
                {LANG_LABEL[seq.language] ?? seq.language}
              </span>

              {/* Steps */}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {seq.stepCount}
              </span>

              {/* Channels count */}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {seq.channels.length}
              </span>

              {/* Active runs */}
              <span style={{
                fontSize: '13px', fontWeight: 500,
                color: seq.activeRunCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)',
              }}>
                {seq.activeRunCount}
              </span>

              {/* Métricas de envío — las mismas que la tarjeta del detalle.
                  El open rate no está a propósito: Apple Mail precarga los
                  píxeles y lo infla (ver CLAUDE.md). */}
              <span style={{ fontSize: '13px', fontWeight: 500, color: (m?.totalSends ?? 0) > 0 ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                {m?.totalSends ?? 0}
                {m && m.uniqueLeads > 0 && (
                  <span style={{ display: 'block', fontSize: '10px', fontWeight: 400, color: 'var(--text-muted)', marginTop: '1px' }}>
                    {m.uniqueLeads} {m.uniqueLeads === 1 ? 'lead' : 'leads'}
                  </span>
                )}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.clickRate ?? 0, { color: 'var(--accent-blue)' }) }}>
                {m?.clickRate ?? 0}%
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.replyRate ?? 0, { color: 'var(--accent-green)' }) }}>
                {m?.replyRate ?? 0}%
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.bounceRate ?? 0, { alertOver: 5, color: 'var(--text-secondary)' }) }}>
                {m?.bounceRate ?? 0}%
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: rateColor(m?.unsubscribeRate ?? 0, { alertOver: 3, color: 'var(--text-secondary)' }) }}>
                {m?.unsubscribeRate ?? 0}%
              </span>

              {/* Status */}
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
                letterSpacing: '0.06em', textTransform: 'uppercase', width: 'fit-content',
                color: seq.active ? 'var(--accent-green)' : 'var(--text-muted)',
                background: seq.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
              }}>
                {seq.active ? 'Activa' : 'Inactiva'}
              </span>

              {/* Actions */}
              <SequenceListActions
                sequenceId={seq.id}
                sequenceName={seq.name}
                active={seq.active}
                activeRunCount={seq.activeRunCount}
              />
            </div>
            )
          })}
          </div>
        </div>
      )}

      {/* Emails de cierre POR AGENTE (058) — super_admin: por tenant → agente;
          owner: todos los agentes del tenant; agent: solo los suyos. El id ancla
          el botón "Configurar emails de cierre" del detalle de lead. */}
      <div id="emails-de-cierre" style={{ scrollMarginTop: '80px' }}>
        {(isSuperAdmin ? purchaseByTenant.length > 0 : ownAgentTemplates.length > 0) && (
          <div style={{ marginTop: '40px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              Emails de cierre
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Cada agente tiene sus 3 correos de hitos del proceso de compra (inicio, pre-cierre,
              completado) por cada idioma que atiende. Los idiomas se gestionan en Configuración → Agentes.
            </p>
          </div>
        )}
        {isSuperAdmin
          ? purchaseByTenant.map(({ tenant_id: tid, tenant_name, agents }) => (
              <div key={tid} style={{ marginTop: '32px' }}>
                <div style={{
                  display: 'inline-block', marginBottom: '4px',
                  fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)',
                  border: '1px solid rgba(201,169,110,0.2)', borderRadius: '6px', padding: '3px 10px',
                }}>
                  {tenant_name}
                </div>
                {agents.map(a => (
                  <PurchaseTemplatesPanel
                    key={a.agent_id}
                    templates={a.templates}
                    agentName={a.agent_name}
                    accentColor={a.accent_color}
                    languages={a.languages}
                    tenantName={tenant_name}
                  />
                ))}
              </div>
            ))
          : ownAgentTemplates.map(a => (
              <PurchaseTemplatesPanel
                key={a.agent_id}
                templates={a.templates}
                agentName={a.agent_name}
                accentColor={a.accent_color}
                languages={a.languages}
              />
            ))}
      </div>
    </>
  )
}
