// Cómo entra un suscriptor de newsletter al CRM. Puro y client-safe para poder
// probarlo sin base de datos.

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
