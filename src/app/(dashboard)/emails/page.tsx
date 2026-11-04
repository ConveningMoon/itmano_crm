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
import { BroadcastsPanel } from './broadcasts-panel'
import { listBroadcasts } from '@/lib/data/email-broadcasts'
import { BROADCAST_OWN_DOMAIN_MESSAGE } from '@/lib/services/broadcast-dispatch'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { createAdminClient } from '@/lib/supabase/admin'
import { SequencesTable } from './sequences-table'
import { NewFolderButton } from '@/components/dashboard/folders'
import { Tabs } from '@/components/ui/tabs'
import { PageHeader } from '@/components/ui/page-header'
import { InfoHint } from '@/components/ui/info-hint'
import { countMissingClosing } from '@/lib/emails/purchase-state'
import { BarChart3, Plus, Mail } from 'lucide-react'
import { freshOnNavigation } from '@/components/layout/fresh-page'

// /emails tiene cuatro clases de correo y antes iban apiladas en una sola página:
//
//   · Secuencias — campañas de nutrición que arrancan con un formulario o a mano.
//   · Grupales — un correo manual a un grupo de leads, una sola vez.
//   · Por etiqueta (117) — obligatorias: salen al etiquetar un lead.
//   · De cierre (036/058) — obligatorias: salen en los hitos del proceso.
//
// Las dos últimas (etiqueta y cierre) no se "lanzan", se CONFIGURAN, y su pregunta es siempre la
// misma: ¿está escrita la versión de cada idioma? Mezclarlas con la lista de
// campañas hacía que ese hueco se leyera como una fila más.
//
// La pestaña viaja en la URL (?tab=) y no en estado del cliente: así el botón
// "Configurar emails de cierre" de la ficha del lead puede enlazar directo.

type EmailsTab = 'secuencias' | 'grupales' | 'etiquetas' | 'cierre'

const TABS: EmailsTab[] = ['secuencias', 'grupales', 'etiquetas', 'cierre']

// Cada pestaña abre con una línea de alcance; la explicación larga va detrás del ⓘ.
function TabIntro({ scope, label, children }: { scope: string; label: string; children: React.ReactNode }) {
  return (
    <div className="toolbar-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 14px' }}>
      <span>{scope}</span>
      <InfoHint label={label}>{children}</InfoHint>
    </div>
  )
}

async function EmailsPage({
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
  const [sequences, purchaseByTenant, ownAgentTemplates, folders, tagCoverage, metrics, broadcasts, broadcastSender] = await Promise.all([
    // (las secuencias primero; los dos últimos alimentan la pestaña de grupales)
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
    // Las mismas métricas de la tarjeta del detalle, para cada fila. Una sola
    // RPC por tenant, en la misma ola que la lista: no necesita los ids antes.
    getMetricsForSequences(tenant_id),
    listBroadcasts(scope),
    // Sin dominio propio no hay envíos masivos: la pestaña lo explica en vez de
    // dejar crear un borrador que nunca podría salir.
    tenant_id
      ? resolveOpenHouseSender(createAdminClient(), tenant_id, BROADCAST_OWN_DOMAIN_MESSAGE)
      : Promise.resolve({ ok: false as const, error: 'Selecciona un tenant desde el centro de control.' }),
  ])

  // Huecos por escribir: es el número que hace falta ver sin entrar a la pestaña.
  const missingTagSequences = tagCoverage.reduce(
    (n, c) => n + c.slots.filter(s => s.sequence === null).length,
    0,
  )

  const hasClosingEmails = isSuperAdmin ? purchaseByTenant.length > 0 : ownAgentTemplates.length > 0

  // Versiones de cierre sin configurar, sólo en los idiomas que cada agente atiende
  // (la misma cuenta que el chip de cada panel). Para super_admin, de todos los tenants.
  const closingAgents = isSuperAdmin ? purchaseByTenant.flatMap(t => t.agents) : ownAgentTemplates
  const missingClosing = closingAgents.reduce((n, a) => n + countMissingClosing(a), 0)

  const sequencesTab = (
    <>
      <TabIntro scope="Campañas de nutrición que arrancan con un formulario o a mano." label="Qué son las secuencias">
        Una secuencia es una serie de emails enviados por Resend que recorre cada lead
        desde que entra por una fuente o la lanzas a mano. Las cifras de cada fila son
        históricas, no de un periodo, y el detalle completo está en Dashboard → Emails.
      </TabIntro>
      <div className="toolbar">
        <span className="toolbar-meta">
          {sequences.length === 0
            ? 'Sin secuencias todavía'
            : `${sequences.length} ${sequences.length === 1 ? 'secuencia' : 'secuencias'}`}
        </span>
        <div className="page-actions">
          <NewFolderButton kind="sequence" />
          <Link href="/emails/new" className="btn btn-primary btn-cta">
            <Plus size={14} />
            Nueva secuencia
          </Link>
        </div>
      </div>

      {sequences.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed var(--border-hover)',
          borderRadius: '12px', padding: '64px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: 'color-mix(in srgb, var(--accent-gold) 12%, transparent)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={20} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Crea tu primera secuencia
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '380px', margin: '0 auto 20px', lineHeight: 1.6 }}>
            Nutre a tus leads automáticamente con una serie de emails enviados por Resend.
          </div>
          <Link href="/emails/new" className="btn btn-primary btn-cta">
            <Plus size={14} />
            Nueva secuencia
          </Link>
        </div>
      ) : (
        <>
        <p className="toolbar-meta" style={{ margin: '0 2px 8px' }}>
          Cifras históricas: suman todos los envíos de cada secuencia desde que existe.
        </p>
        <SequencesTable
          sequences={sequences}
          metrics={Object.fromEntries(metrics)}
          isSuperAdmin={isSuperAdmin}
          folders={folders}
        />
        </>
      )}
    </>
  )

  const groupTab = (
    <>
      <TabIntro scope="Un correo manual a un grupo de leads, una sola vez." label="Qué son los correos grupales">
        Eliges la audiencia por etiqueta, etapa, agente o fuente, o marcas los leads uno
        por uno. Cada lead lo recibe en su idioma y firmado por su agente. Requiere un
        dominio propio para enviar.
      </TabIntro>
      <BroadcastsPanel broadcasts={broadcasts} senderError={broadcastSender.ok ? null : broadcastSender.error} />
    </>
  )

  const tagTab = (
    <>
      <TabIntro scope="Salen solos al poner la etiqueta a un lead." label="Cómo funcionan los correos por etiqueta">
        Estos correos no se mandan a una lista: salen cuando alguien pone la etiqueta a un
        lead. Hace falta una versión por cada idioma que atiende el equipo — el lead
        recibe la de su idioma, y si esa versión no existe no se le manda nada. Los
        idiomas vienen de Configuración → Agentes.
      </TabIntro>
      <TagSequencesPanel coverage={tagCoverage} canManage={!scope.agentId} />
    </>
  )

  const closingTab = (
    <>
      <TabIntro scope="Tres correos por agente en los hitos del proceso de compra." label="Cómo funcionan los correos de cierre">
        Cada agente tiene sus 3 correos de hitos del proceso de compra (inicio, pre-cierre,
        completado) por cada idioma que atiende. Los idiomas se gestionan en
        Configuración → Agentes.
      </TabIntro>
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
                color: 'var(--accent-gold)', background: 'color-mix(in srgb, var(--accent-gold) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-gold) 20%, transparent)', borderRadius: '6px', padding: '3px 10px',
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
      <PageHeader
        title="Email"
        description="Lo que se envía y cuándo."
        hint="Campañas de nutrición, correos a un grupo de leads y los correos obligatorios que dispara el CRM. Las métricas completas están en Dashboard → Emails."
        actions={
          <Link href="/dashboard?tab=emails" className="btn btn-ghost">
            <BarChart3 size={14} />Métricas
          </Link>
        }
      />

      {/* El id se conserva para los enlaces viejos a /emails#emails-de-cierre. */}
      <div id="emails-de-cierre" style={{ scrollMarginTop: '80px' }}>
        <Tabs
          defaultKey={activeTab}
          items={[
            { key: 'secuencias', label: 'Secuencias',   badge: sequences.length },
            { key: 'grupales',   label: 'Grupales',     badge: broadcasts.length || undefined },
            { key: 'etiquetas',  label: 'Por etiqueta', alert: missingTagSequences > 0 },
            { key: 'cierre',     label: 'De cierre',    alert: missingClosing > 0 },
          ]}
          content={{
            secuencias: sequencesTab,
            grupales:   groupTab,
            etiquetas:  tagTab,
            cierre:     closingTab,
          }}
        />
      </div>
    </>
  )
}

export default freshOnNavigation(EmailsPage)
