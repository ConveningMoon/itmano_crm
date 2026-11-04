// Por qué un lead no recibe un correo grupal. Las razones son las de
// decideRecipient (open-houses/audience.ts); el texto es propio porque las de
// open house hablan del evento.
export const SKIP_REASON_TEXT: Record<string, string> = {
  no_email:      'sin email',
  email_blocked: 'email bloqueado (baja, rebote o spam)',
  no_language:   'su idioma no tiene versión en este correo',
}
