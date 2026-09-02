// Quién firma una edición. PURO: sin server-only, sin red.
//
// La IA redacta; no firma. Una edición generada con IA lleva la firma del
// agente que pulsó generar — el objetivo del producto es posicionar a personas,
// y un artículo firmado por "la IA" no construye nada.
//
// Lo que se devuelve se guarda DESNORMALIZADO en la edición (author_name,
// author_title): es una instantánea del momento de escribir, no un puntero.
// Ver la migración 111 para el porqué.

export type EditionAuthor = {
  /** Vínculo interno con el agente. null cuando firma la agencia. */
  agentId: string | null
  /** Siempre presente: nunca se publica sin firma. */
  name:    string
  /** Segunda línea de la firma. null si el agente no declaró especialidad. */
  title:   string | null
}

function limpiar(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export function resolveEditionAuthor(args: {
  agent: { id: string; name: string; specialty: string | null } | null
  tenantName: string
}): EditionAuthor {
  const nombre = limpiar(args.agent?.name)
  // Un agente sin nombre utilizable es lo mismo que ningún agente: firmar con
  // una cadena vacía sería peor que firmar con la agencia.
  if (!args.agent || !nombre) {
    return { agentId: null, name: limpiar(args.tenantName), title: null }
  }
  const especialidad = limpiar(args.agent.specialty)
  return {
    agentId: args.agent.id,
    name:    nombre,
    title:   especialidad || null,
  }
}
