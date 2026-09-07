import Link from 'next/link'
import { listSequences } from '@/lib/data/email-sequences'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { getAllPurchaseTemplatesByTenant, getPurchaseTemplatesByAgent } from './purchase-templates-actions'
import { PurchaseTemplatesPanel } from './purchase-templates-panel'
import { getMetricsForSequences } from '@/lib/services/email-metrics'
import { listFolders } from '@/lib/data/folders'
import { SequencesTable } from './sequences-table'
import { NewFolderButton } from '@/components/dashboard/folders'
import { Plus, Mail } from 'lucide-react'

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
  // Carpetas de QUIEN MIRA: la organización es personal, no del tenant.
  const folders = await listFolders('sequence', tenant_id, ctx.user_id)

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <NewFolderButton kind="sequence" />
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
        <SequencesTable
          sequences={sequences}
          metrics={Object.fromEntries(metrics)}
          isSuperAdmin={isSuperAdmin}
          folders={folders}
        />
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
