import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { columns } from '@/lib/supabase/columns'
import { getSeriesForTenant, getArchivedSeriesForTenant, getSourceDomainsFor } from '@/lib/data/newsletters'
import { listSequences } from '@/lib/data/email-sequences'
import { canUseNewsletters } from '@/lib/access/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { SeriesList } from './series-list'

// Índice de series de newsletter — el equivalente a /sources para este canal:
// aquí el tenant ve sus series y crea una nueva. Las ediciones se crean y
// editan en /newsletters/nueva y /newsletters/[id].
//
// Igual que las server actions de este módulo (ver actions.ts → guard()), el
// plan del tenant NO vive en `tenants`: hay que leerlo de `subscriptions`.

// La generación con IA corre como Server Action DENTRO de esta ruta
// (GenerateModal → generateEditionWithAi): investigación con búsqueda web y
// redacción, encadenadas. Medido de punta a punta: 107–222 s. Sin este techo
// Vercel mata la función a mitad de camino con los tokens de Anthropic ya
// cobrados y sin llegar a registrarlos en el ledger — el usuario ve un error de
// plataforma y el gasto no aparece por ningún lado. En local no se nota porque
// `npm run dev` no tiene ese límite.
export const maxDuration = 300

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])
const TENANT_COLUMNS       = columns('tenants', ['slug'])
const AGENT_COLUMNS        = columns('agents', ['id', 'name'])

// `?generar=1` abre el modal de generación de entrada. Lo usa el banner de
// /newsletters/nueva, que antes enlazaba aquí prometiendo "Generar con IA" y
// dejaba al usuario delante de la lista, buscando el botón a mano.
export default async function NewslettersPage(
  { searchParams }: { searchParams: Promise<{ generar?: string }> },
) {
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const { generar } = await searchParams
  const db = createAdminClient()

  // super_admin en modo hub (sin tenant seleccionado) no tiene subscripción
  // que leer — canUseNewsletters ya lo deja pasar siempre por rol, así que el
  // plan por defecto aquí nunca lo bloquea a él, solo a un tenant real.
  let plan: SubscriptionPlan = 'esencial'
  if (tenant_id) {
    const { data: subRow } = await db
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    // reason: el cliente de Supabase no está tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  }

  if (!canUseNewsletters({ role }, plan)) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Newsletters
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Contenido editorial con captación de suscriptores, publicado con tu marca.
        </p>
        <div style={{
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Tu plan actual no incluye newsletters. Está disponible desde Growth, junto con tu
            dominio de envío propio y el análisis completo. Contáctanos para conversar sobre tu
            inversión.
          </p>
        </div>
      </div>
    )
  }

  // Las archivadas van a la misma pantalla, en su propio bloque: archivar una
  // serie sin dejarla a la vista la volvería inalcanzable, y eliminarla —el
  // segundo paso del patrón de Fuentes— sólo se puede hacer desde su detalle.
  const [series, archivedSeries, sequences] = tenant_id
    ? await Promise.all([
        getSeriesForTenant(tenant_id),
        getArchivedSeriesForTenant(tenant_id),
        listSequences(tenant_id),
      ])
    : [[], [], []]

  let agents: Array<{ id: string; name: string }> = []
  let tenantSlug = ''
  // La allowlist va A LA VISTA en el modal de generación (GenerateModal): el
  // cliente tiene que ver de qué fuentes va a salir su contenido antes de
  // pedirlo. Por getSourceDomainsFor, que es la única puerta: la lista que se
  // pinta tiene que ser la misma que llegará a la herramienta de búsqueda.
  let sourceDomains: string[] = []
  if (tenant_id) {
    const [{ data: agentRows }, { data: tenantRow }, domains] = await Promise.all([
      db.from('agents').select(AGENT_COLUMNS).eq('tenant_id', tenant_id).eq('active', true).order('name'),
      db.from('tenants').select(TENANT_COLUMNS).eq('id', tenant_id).maybeSingle(),
      getSourceDomainsFor(tenant_id),
    ])
    // reason: ver arriba — cliente de Supabase no tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    agents = ((agentRows ?? []) as any[]).map(a => ({ id: a.id as string, name: a.name as string }))
    // reason: ver arriba.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''
    sourceDomains = domains
  }

  return (
    <SeriesList
      series={series}
      archivedSeries={archivedSeries}
      sequences={sequences}
      agents={agents}
      tenantSlug={tenantSlug}
      sourceDomains={sourceDomains}
      canEditSources={role === 'super_admin'}
      openGenerate={generar === '1'}
    />
  )
}
