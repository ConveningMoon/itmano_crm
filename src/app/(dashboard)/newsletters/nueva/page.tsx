import { redirect } from 'next/navigation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getSeriesForTenant, getSourceDomainsFor } from '@/lib/data/newsletters'
import { getStudioImages } from '@/lib/data/studio'
import { canUseNewsletters } from '@/lib/access/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { NewEditionForm } from './new-edition-form'

// Creación de una edición nueva. Server Component: fetch de series + biblioteca
// del Estudio, luego el formulario (client) hace su trabajo y navega al editor
// completo en /newsletters/<id>.
//
// "Generar con IA" se abre DESDE AQUÍ, en el mismo formulario y sin navegar:
// es la otra forma de hacer lo mismo que esta pantalla, así que sacar al
// usuario a /newsletters para ofrecérsela era pedirle que se fuera de donde ya
// estaba. El botón vive junto al título, en new-edition-form.tsx.

// La generación con IA corre como Server Action DENTRO de esta ruta
// (GenerateModal → generateEditionWithAi): investigación con búsqueda web y
// redacción, encadenadas. Medido de punta a punta: 107–222 s. Sin este techo
// Vercel mata la función a mitad de camino con los tokens de Anthropic ya
// cobrados y sin llegar a registrarlos en el ledger — el usuario ve un error de
// plataforma y el gasto no aparece por ningún lado. En local no se nota porque
// `npm run dev` no tiene ese límite.
//
// Vivía en /newsletters, que es de donde se abría antes el modal. Al mover el
// botón aquí había que mover esto con él: el techo aplica a la ruta que EJECUTA
// la action, no a la que tenía el botón.
export const maxDuration = 300

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])

export default async function NewEditionPage() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) redirect('/newsletters')
  const tenantId = ctx.tenant_id

  const db = createAdminClient()
  const { data: subRow } = await db
    .from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  if (!canUseNewsletters({ role: ctx.role }, plan)) redirect('/newsletters')

  const [series, studioImages, sourceDomains] = await Promise.all([
    getSeriesForTenant(tenantId),
    getStudioImages(tenantId),
    // Vacío = este tenant nunca ha generado; el panel lo explica y se preparan
    // solas en esa primera generación (ai/source-catalog.ts).
    getSourceDomainsFor(tenantId),
  ])

  return (
    <div style={{ maxWidth: '560px' }}>
      <NewEditionForm series={series} studioImages={studioImages} sourceDomains={sourceDomains} />
    </div>
  )
}
