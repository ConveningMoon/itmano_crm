// Quién firma una edición. PURO: sin server-only, sin red.
//
// La IA redacta; no firma. Una edición generada con IA lleva la firma del
// agente que pulsó generar — el objetivo del producto es posicionar a personas,
// y un artículo firmado por "la IA" no construye nada.
//
// Lo que se devuelve se guarda DESNORMALIZADO en la edición (author_name,
// author_title): es una instantánea del momento de escribir, no un puntero.
// Ver la migración 111 para el porqué.
//
// `author_title` NO sale de `agents.specialty`. Esa columna es un código de
// SEGMENTO DE AUDIENCIA (`hispanic | military | first_buyer | brazilian`) —
// a qué público atiende el agente, no un cargo suyo — y no se lee en ningún
// otro sitio del repo fuera de lo que añadió esta misma tarea. Publicarlo bajo
// la firma de una persona ("Por María González / hispanic") es incomprensible
// para el lector y se lee como una etiqueta sobre ella, no sobre su práctica.
// `newsletter_editions.author_title` queda reservada para un cargo que el
// propio agente escriba de sí mismo el día que ese campo exista — hoy no
// existe, así que la firma es sólo el nombre.

export type EditionAuthor = {
  /** Vínculo interno con el agente. null cuando firma la agencia. */
  agentId: string | null
  /** Siempre presente: nunca se publica sin firma. */
  name:    string
}

function limpiar(value: string | null | undefined): string {
  return (value ?? '').trim()
}

export function resolveEditionAuthor(args: {
  agent: { id: string; name: string } | null
  tenantName: string
}): EditionAuthor {
  const nombre = limpiar(args.agent?.name)
  // Un agente sin nombre utilizable es lo mismo que ningún agente: firmar con
  // una cadena vacía sería peor que firmar con la agencia.
  if (!args.agent || !nombre) {
    return { agentId: null, name: limpiar(args.tenantName) }
  }
  return { agentId: args.agent.id, name: nombre }
}
