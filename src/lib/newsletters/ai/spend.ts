// El gasto que una llamada al modelo YA causó, y el error que lo transporta.
//
// Existe por un defecto concreto: `researchMarket` y `draftEdition` lanzan en
// varios sitios que están DESPUÉS de que Anthropic respondiera — es decir, con
// los tokens (y las búsquedas) ya facturados. El orquestador atrapaba ese
// `throw` y devolvía `{ ok: false }` sin registrar nada, así que el gasto real
// existía en la factura de ITMANO y no en `ai_usage_events`.
//
// Por qué un error tipado y no cambiar el retorno a `{ ok, ... }`: los dos
// pasos tienen media docena de motivos de fallo distintos y todos comparten la
// misma respuesta del llamador (registrar el gasto y traducir el mensaje). Un
// resultado obligaría a propagar a mano un `error | null` por cada punto de
// salida y a que el llamador lo destructurase; el error tipado deja la firma
// intacta —siguen devolviendo el dato útil— y añade el gasto sólo donde lo hay.
// `spendOf` es la única puerta de lectura, así que un `catch` que no lo llame
// no puede confundir un fallo sin gasto con uno que sí lo tuvo.

export interface AiSpend {
  usage:    { input: number; output: number }
  /** Búsquedas web facturadas. 0 en la redacción, que no busca. */
  searches: number
}

/** Un fallo del modelo que llegó con la respuesta ya cobrada. */
export class AiSpentError extends Error {
  readonly spend: AiSpend

  constructor(message: string, spend: AiSpend) {
    super(message)
    this.name = 'AiSpentError'
    this.spend = spend
  }
}

/** El gasto que trae un error, o null si ese fallo no llegó a costar nada. */
export function spendOf(e: unknown): AiSpend | null {
  return e instanceof AiSpentError ? e.spend : null
}
