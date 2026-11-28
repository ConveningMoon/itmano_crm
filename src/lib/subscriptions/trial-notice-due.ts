export type TrialNoticeMoment = '3d' | 'today'

/**
 * Qué aviso toca hoy para una prueba. Mismos días que trialDaysLeft (techo de
 * ms/día) para que banner y correo coincidan, pero sin acotar a 0 para poder
 * distinguir "vence hoy" (0) de "venció hace días" (negativo → null).
 */
export function trialNoticeDue(trialEndsAt: string, now: Date): TrialNoticeMoment | null {
  const days = Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000)
  if (days === 3) return '3d'
  if (days === 0) return 'today'
  return null
}
