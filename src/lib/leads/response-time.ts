// Cómo se lee un tiempo de respuesta.
//
// Módulo PURO: lo comparten el servidor y el cliente, y es lo único que decide
// cómo se escribe una duración en toda la app.

/**
 * Duración en horas → texto para humanos.
 *
 * La unidad se elige por magnitud, no por gusto: "0.3 h" no le dice nada a
 * nadie y "37 h" obliga a dividir mentalmente. Debajo de una hora, minutos;
 * debajo de un día, horas; a partir de ahí, días con el resto en horas.
 *
 * `null` es "todavía no hay nada medido" — distinto de cero.
 */
export function formatResponseTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  if (hours < 0) return '—'

  if (hours < 1) {
    const min = Math.round(hours * 60)
    // Una respuesta en menos de 30 segundos redondea a 0 min y se leería como
    // "instantáneo"; se muestra el piso real en su lugar.
    return min <= 0 ? '<1 min' : `${min} min`
  }

  if (hours < 24) {
    // Un decimal sólo si aporta: "3 h" se lee mejor que "3.0 h".
    const r = Math.round(hours * 10) / 10
    return Number.isInteger(r) ? `${r} h` : `${r} h`
  }

  const dias  = Math.floor(hours / 24)
  const resto = Math.round(hours - dias * 24)
  // 24 h de resto significa que el redondeo empujó al día siguiente.
  if (resto === 24) return `${dias + 1} d`
  return resto === 0 ? `${dias} d` : `${dias} d ${resto} h`
}

/**
 * Cómo de bien está ese tiempo. Los cortes son de sentido común del sector —
 * responder en la primera hora es el estándar que todo el mundo cita — y sirven
 * sólo para colorear, nunca para puntuar.
 */
export function responseTimeTone(hours: number | null | undefined): 'bueno' | 'medio' | 'malo' | 'neutro' {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'neutro'
  if (hours <= 1)  return 'bueno'
  if (hours <= 24) return 'medio'
  return 'malo'
}
