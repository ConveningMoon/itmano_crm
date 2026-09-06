// Quién firma una edición. PURO: sin server-only, sin red.
//
// La IA redacta; no firma. Una edición generada con IA lleva la firma del
// agente que pulsó generar — el objetivo del producto es posicionar a personas,
// y un artículo firmado por "la IA" no construye nada.
//
// Son DOS firmas independientes, no una elección entre dos (migración 113):
// la persona y la agencia. Firmar sólo con el agente pierde la marca; firmar
// sólo con la agencia no posiciona a nadie. Lo normal es querer las dos, y
// cada una se puede quitar por separado.
//
// Lo que se devuelve se guarda DESNORMALIZADO en la edición (author_name,
// author_org_name, author_avatar_url): es una instantánea del momento de
// escribir, no un puntero. Ver la migración 111 para el porqué.
//
// `author_title` NO sale de `agents.specialty`. Esa columna es un código de
// SEGMENTO DE AUDIENCIA (`hispanic | military | first_buyer | brazilian`) —
// a qué público atiende el agente, no un cargo suyo — y no se lee en ningún
// otro sitio del repo fuera de lo que añadió esta misma tarea. Publicarlo bajo
// la firma de una persona ("Por María González / hispanic") es incomprensible
// para el lector y se lee como una etiqueta sobre ella, no sobre su práctica.
// `newsletter_editions.author_title` queda reservada para un cargo que el
// propio agente escriba de sí mismo el día que ese campo exista — hoy no
// existe, así que la firma de una persona es sólo su nombre y su foto.

/** El agente tal como lo necesita la firma: nombre y foto, nada más. */
export type AuthorAgent = {
  id: string
  name: string
  /** agents.cover_photo_url — la foto que el agente sube en Ajustes. */
  coverPhotoUrl?: string | null
}

export type EditionAuthor = {
  /** Vínculo interno con el agente. null cuando no firma ninguna persona. */
  agentId:   string | null
  /** Nombre de la persona que firma. null = la edición no lleva firma personal. */
  name:      string | null
  /** Foto de esa persona. null si no tiene, o si no firma una persona. */
  avatarUrl: string | null
  /** Nombre de la agencia. null = la agencia no firma. */
  orgName:   string | null
}

function limpiar(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * Resuelve la firma que se va a congelar en la fila.
 *
 * A diferencia de la versión de la 111, esto ya NO cae a la agencia cuando no
 * hay agente: son dos decisiones separadas y `signWithOrg` es la única que
 * manda sobre la firma de la agencia. Una edición puede quedarse sin ninguna
 * de las dos — es una elección del tenant, no un estado inválido que haya que
 * rellenar con lo primero que tengamos a mano.
 */
export function resolveEditionAuthor(args: {
  agent: AuthorAgent | null
  tenantName: string
  /** ¿Firma también la agencia? */
  signWithOrg: boolean
}): EditionAuthor {
  const nombre = limpiar(args.agent?.name)
  // Un agente sin nombre utilizable es lo mismo que ningún agente: firmar con
  // una cadena vacía deja un "Por " suelto en la página pública.
  const firmaPersona = args.agent && nombre
  const orgName = limpiar(args.tenantName)

  return {
    agentId:   firmaPersona ? args.agent!.id : null,
    name:      firmaPersona ? nombre : null,
    // La foto sólo acompaña a una persona: sin firma personal no hay avatar
    // que mostrar, y arrastrarlo dejaría una cara junto al nombre de la marca.
    avatarUrl: firmaPersona ? (limpiar(args.agent!.coverPhotoUrl) || null) : null,
    // Una agencia sin nombre no puede firmar aunque se pida.
    orgName:   args.signWithOrg && orgName ? orgName : null,
  }
}
