import Link from 'next/link'
import { listSequences } from '@/lib/data/email-sequences'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { getAllPurchaseTemplatesByTenant, getPurchaseTemplatesByAgent } from './purchase-templates-actions'
import { PurchaseTemplatesPanel } from './purchase-templates-panel'
import { getMetricsForSequences } from '@/lib/services/email-metrics'
import { listFolders } from '@/lib/data/folders'
import { getTagSequenceCoverage } from '@/lib/data/tag-sequences'
import { TagSequencesPanel } from './tag-sequences-panel'
import { SequencesTable } from './sequences-table'
import { NewFolderButton } from '@/components/dashboard/folders'
import { Tabs } from '@/components/ui/tabs'
import { Plus, Mail } from 'lucide-react'

// /emails tiene tres clases de correo y antes iban apiladas en una sola página:
//
//   · Secuencias — campañas de nutrición que arrancan con un formulario o a mano.
//   · Por etiqueta (117) — obligatorias: salen al etiquetar un lead.
//   · De cierre (036/058) — obligatorias: salen en los hitos del proceso.
//
// Las dos últimas no se "lanzan", se CONFIGURAN, y su pregunta es siempre la
// misma: ¿está escrita la versión de cada idioma? Mezclarlas con la lista de
// campañas hacía que ese hueco se leyera como una fila más.
//
// La pestaña viaja en la URL (?tab=) y no en estado del cliente: así el botón
// "Configurar emails de cierre" de la ficha del lead puede enlazar directo.

type EmailsTab = 'secuencias' | 'etiquetas' | 'cierre'

const TABS: EmailsTab[] = ['secuencias', 'etiquetas', 'cierre']

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const rawTab = (await searchParams).tab
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab
  const activeTab: EmailsTab = TABS.includes(tabParam as EmailsTab) ? (tabParam as EmailsTab) : 'secuencias'

  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)
  const [sequences, purchaseByTenant, ownAgentTemplates, folders, tagCoverage] = await Promise.all([
    // 'channel': las disparadas por etiqueta tienen su propia pestaña. Verlas
    // aquí invitaría a borrarlas o a engancharlas a una fuente.
    listSequences(tenant_id, scope.agentId, 'channel'),
    isSuperAdmin ? getAllPurchaseTemplatesByTenant() : Promise.resolve([]),
    // Emails de cierre por agente (058): owner ve todos los agentes del tenant;
    // rol 'agent' solo los suyos (el filtro lo refuerza la propia action).
    !isSuperAdmin && tenant_id
      ? getPurchaseTemplatesByAgent(tenant_id, { agentId: scope.agentId })
      : Promise.resolve([]),
    // No depende de las secuencias: leerla aquí evita sumar sus queries al
    // final de cada render y de cada Server Action de carpetas.
    listFolders('sequence', tenant_id, ctx.user_id),
    getTagSequenceCoverage(tenant_id),
  ])

  // Las mismas métricas de la tarjeta del detalle, para cada fila. Batcheado:
  // una llamada por secuencia serían 3 queries por fila leyendo los mismos datos.
  const metrics = await getMetricsForSequences(sequences.map(s => s.id))

  // Huecos por escribir: es el número que hace falta ver sin entrar a la pestaña.
  const missingTagSequences = tagCoverage.reduce(
    (n, c) => n + c.slots.filter(s => s.sequence === null).length,
    0,
  )

  const hasClosingEmails = isSuperAdmin ? purchaseByTenant.length > 0 : ownAgentTemplates.length > 0

  const sequencesTab = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
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
    </>
  )

  const closingTab = (
    <>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.55, maxWidth: '680px' }}>
        Cada agente tiene sus 3 correos de hitos del proceso de compra (inicio, pre-cierre,
        completado) por cada idioma que atiende. Los idiomas se gestionan en
        Configuración → Agentes.
      </p>
      {!hasClosingEmails && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed var(--border-subtle)',
          borderRadius: '12px', padding: '40px 32px', textAlign: 'center',
          fontSize: '13px', color: 'var(--text-muted)',
        }}>
          Todavía no hay agentes con idiomas configurados.
        </div>
      )}
      {isSuperAdmin
        ? purchaseByTenant.map(({ tenant_id: tid, tenant_name, agents }) => (
            <div key={tid} style={{ marginTop: '8px' }}>
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
    </>
  )

  return (
    <>
      <style>{`
        .seq-row { transition: background 0.1s; }
        .seq-row:hover { background: var(--bg-elevated) !important; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
          Email
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Campañas de nutrición y los correos obligatorios que dispara el CRM.
        </p>
      </div>

      {/* El id se conserva para los enlaces viejos a /emails#emails-de-cierre. */}
      <div id="emails-de-cierre" style={{ scrollMarginTop: '80px' }}>
        <Tabs
          defaultKey={activeTab}
          items={[
            { key: 'secuencias', label: 'Secuencias',   badge: sequences.length },
            { key: 'etiquetas',  label: 'Por etiqueta', badge: missingTagSequences > 0 ? missingTagSequences : undefined },
            { key: 'cierre',     label: 'De cierre' },
          ]}
          content={{
            secuencias: sequencesTab,
            etiquetas:  <TagSequencesPanel coverage={tagCoverage} canManage={!scope.agentId} />,
            cierre:     closingTab,
          }}
        />
      </div>
    </>
  )
}
