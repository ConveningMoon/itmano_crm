import { redirect } from 'next/navigation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getSourceDomainsFor } from '@/lib/data/newsletters'
import { getStudioImages } from '@/lib/data/studio'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { getSubscription } from '@/lib/data/subscriptions'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { NewEditionForm } from './new-edition-form'

// Creación de una edición nueva. Server Component: fetch de la biblioteca del
// Estudio y las fuentes del tenant, luego el formulario (client) hace su
// trabajo y navega al editor completo en /newsletters/<id>. El canal implícito
// se resuelve dentro de las actions que crean la edición, no aquí.
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

export default async function NewEditionPage() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) redirect('/newsletters')
  const tenantId = ctx.tenant_id

  // El plan es la misma lectura cacheada que hace el shell, pero esperarlo
  // ANTES de lanzar el resto dejaba esas dos lecturas en una ola posterior.
  // Van juntas y la guarda se evalúa después: si no alcanza, lo leído (todo
  // acotado al tenant) se descarta sin llegar al cliente.
  const [subscription, studioImages, sourceDomains] = await Promise.all([
    getSubscription(tenantId),
    getStudioImages(tenantId),
    // Vacío = este tenant nunca ha generado; el panel lo explica y se preparan
    // solas en esa primera generación (ai/source-catalog.ts).
    getSourceDomainsFor(tenantId),
  ])
  const plan: SubscriptionPlan = subscription?.plan ?? 'esencial'
  if (!canUseNewsletters({ role: ctx.role }, plan)) redirect('/newsletters')

  return (
    <div style={{ maxWidth: '560px' }}>
      <NewEditionForm studioImages={studioImages} sourceDomains={sourceDomains} />
    </div>
  )
}
