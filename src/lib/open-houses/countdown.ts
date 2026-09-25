// Cuenta regresiva de un open house. PURA: la pinta la página pública cada
// segundo en el cliente y la reproduce, con el mismo cálculo, el prompt que se
// le da a la IA de la web propia del cliente.

export type CountdownPhase = 'upcoming' | 'live' | 'ended'

export interface CountdownState {
  phase:   CountdownPhase
  days:    number
  hours:   number
  minutes: number
  seconds: number
}

export function countdown(startsAt: Date | string, endsAt: Date | string, now: Date = new Date()): CountdownState {
  const start = new Date(startsAt).getTime()
  const end   = new Date(endsAt).getTime()
  const t     = now.getTime()
  if (t >= end)   return { phase: 'ended', days: 0, hours: 0, minutes: 0, seconds: 0 }
  if (t >= start) return { phase: 'live',  days: 0, hours: 0, minutes: 0, seconds: 0 }

  let rest = Math.floor((start - t) / 1000)
  const days    = Math.floor(rest / 86400); rest -= days * 86400
  const hours   = Math.floor(rest / 3600);  rest -= hours * 3600
  const minutes = Math.floor(rest / 60)
  const seconds = rest - minutes * 60
  return { phase: 'upcoming', days, hours, minutes, seconds }
}

export const COUNTDOWN_LABELS: Record<string, {
  title: string; live: string; ended: string; cancelled: string
  days: string; hours: string; minutes: string; seconds: string
  rsvp: string; rsvpDone: string; addToCalendar: string
}> = {
  es: {
    title: 'Open house', live: 'El open house está ocurriendo ahora', ended: 'Este open house ya terminó',
    cancelled: 'Este open house fue cancelado',
    days: 'días', hours: 'horas', minutes: 'min', seconds: 'seg',
    rsvp: 'Confirmar asistencia', rsvpDone: '¡Listo! Te esperamos.', addToCalendar: 'Agregar al calendario',
  },
  en: {
    title: 'Open house', live: 'The open house is happening now', ended: 'This open house has ended',
    cancelled: 'This open house was cancelled',
    days: 'days', hours: 'hours', minutes: 'min', seconds: 'sec',
    rsvp: 'RSVP', rsvpDone: "You're all set. See you there!", addToCalendar: 'Add to calendar',
  },
  pt: {
    title: 'Open house', live: 'O open house está acontecendo agora', ended: 'Este open house já terminou',
    cancelled: 'Este open house foi cancelado',
    days: 'dias', hours: 'horas', minutes: 'min', seconds: 'seg',
    rsvp: 'Confirmar presença', rsvpDone: 'Pronto! Esperamos você.', addToCalendar: 'Adicionar à agenda',
  },
}

export function countdownLabels(language: string) {
  return COUNTDOWN_LABELS[language] ?? COUNTDOWN_LABELS.en
}
