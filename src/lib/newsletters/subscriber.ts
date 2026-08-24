// Cómo entra (y cómo sale) un suscriptor de newsletter del CRM.
// `shouldAssessFit`, `subscriberMetadata` y `mergeSubmissionMetadata` son
// puras y client-safe, pensadas para poder probarlas sin base de datos.
// `graduateSubscriber` es la excepción: necesita el cliente admin porque su
// trabajo es escribir en `leads`.
//
// AdminClient sólo se importa como TIPO: un `import type` se borra al
// compilar, así que no arrastra `@/lib/supabase/admin` (ni el cliente de
// Supabase) al bundle — las funciones puras de arriba se quedan client-safe.
import type { createAdminClient } from '@/lib/supabase/admin'
type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Si vale la pena gastar IA analizando el fit de este lead.
 *
 * La pregunta NO es "¿es suscriptor?" sino "¿hay algo que analizar?": un
 * formulario de suscripción pide email y nombre, así que el fit_profile sale
 * vacío y el modelo produciría un briefing sobre la nada, cobrando por ello.
 * Formulado así protege además el caso de un lead magnet mal configurado que no
 * recoge ninguna dimensión.
 *
 * El canal `newsletter` se excluye siempre: aunque un día su formulario recoja
 * dimensiones, un lector no es un prospecto hasta que muestra intención — y
 * entonces lo analizan las rutas que ya existen (respuesta de email, formulario
 * de contacto, otro intake).
 */
export function shouldAssessFit(
  channelType: string,
  fitProfile: Record<string, unknown> | null,
): boolean {
  if (channelType === 'newsletter') return false
  if (!fitProfile) return false
  return Object.keys(fitProfile).length > 0
}

/**
 * La marca que hace `is_subscriber` verdadero en leads_list y saca al lead del
 * cálculo de quintiles (migración 106). Mismo mecanismo que `metadata.imported`
 * de la 080.
 *
 * `consent` guarda la PRUEBA del consentimiento: el RGPD no exige doble opt-in,
 * pero sí exige poder demostrarlo (art. 7.1), y eso no se puede añadir
 * retroactivamente a una lista ya capturada.
 */
export function subscriberMetadata(args: {
  channelId:   string
  consentText: string
  sourceUrl:   string
}): Record<string, unknown> {
  const at = new Date().toISOString()
  return {
    newsletter_subscriber: {
      at,
      channel_id: args.channelId,
      consent: { text: args.consentText, source_url: args.sourceUrl, at },
    },
  }
}

/**
 * Fusiona el metadata BASE de un lead (lo que ya tenía la fila, o lo que este
 * mismo insert acaba de escribirle si el lead es nuevo) con lo que aporta ESTE
 * envío del intake (`intent`, `budget_amount`).
 *
 * Existe como función pura, separada del route, para poder probar sin base de
 * datos el caso que la protege: un lead NUEVO de canal `newsletter` no tiene
 * fila previa que leer (`existingLead` es null en el intake), así que si esa
 * misma sumisión trae además un `intent` reconocido, `base` tiene que ser el
 * metadata que YA se insertó (con la marca `newsletter_subscriber` incluida)
 * — nunca `{}` a ciegas, o la fusión de abajo borraría la marca y con ella la
 * prueba de consentimiento en el mismo request que la creó.
 */
export function mergeSubmissionMetadata(
  base: Record<string, unknown> | null,
  additions: { intent?: string | null; budgetAmount?: number | null },
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    ...(additions.intent ? { intent: additions.intent } : {}),
    ...(additions.budgetAmount != null ? { budget_amount: additions.budgetAmount } : {}),
  }
}

/**
 * Gradúa a un suscriptor: en cuanto muestra intención real, deja de ser sólo
 * un LECTOR y tiene que volver a contar para la calidad de la cartera. Quita
 * la clave `metadata.newsletter_subscriber` del lead (conservando el resto
 * del metadata intacto) — es la única forma en que un lead sale del hueco que
 * abre migración 106 al excluir de los quintiles a quien lleve la marca.
 *
 * Existe porque nada más en el repo la quita. `assessLeadFit` reinterpreta
 * `fit_profile`, nunca toca `metadata`: sin esta función, un suscriptor que
 * después rellena un lead magnet o responde un correo quedaría fuera de los
 * quintiles PARA SIEMPRE — el mismo fallo silencioso que ya sufrió
 * `refresh_quality_bands()` (ver CLAUDE.md).
 *
 * Best-effort: nunca lanza al llamador. Idempotente — si el lead no tiene la
 * marca (o no existe), no escribe nada.
 */
export async function graduateSubscriber(db: AdminClient, leadId: string): Promise<void> {
  try {
    const { data: lead } = await db.from('leads').select('metadata').eq('id', leadId).maybeSingle()
    // reason: el cliente de Supabase no está tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (lead as any)?.metadata as Record<string, unknown> | null | undefined
    if (!metadata || typeof metadata !== 'object' || !('newsletter_subscriber' in metadata)) return

    const rest = { ...metadata }
    delete rest.newsletter_subscriber

    const { error } = await db.from('leads').update({ metadata: rest }).eq('id', leadId)
    if (error) {
      console.error(JSON.stringify({
        service: 'newsletters-subscriber', lead_id: leadId, error: 'graduate_update_failed', detail: error.message,
      }))
    }
  } catch (err) {
    console.error(JSON.stringify({
      service: 'newsletters-subscriber', lead_id: leadId, error: 'graduate_failed',
      detail: err instanceof Error ? err.message : String(err),
    }))
  }
}
