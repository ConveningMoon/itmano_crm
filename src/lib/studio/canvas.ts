import type { Aspect, TextZone } from './types'

// Geometría del Estudio, PURA (sin sharp ni fuentes) para poder probarla sola.
// La "banda" es el rectángulo donde el compositor escribe y el mismo que el
// director de prompt le pide al modelo dejar limpio: es la unión entre la mitad
// generada y la mitad determinista.

export const CANVAS: Record<Aspect, { width: number; height: number }> = {
  '1:1':  { width: 1080, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
}

export const MARGIN = 84

// Aire reservado arriba y abajo en story para no quedar debajo de la interfaz
// de Instagram (avatar arriba, barra de respuesta abajo).
const STORY_SAFE = 240

export function allowedZones(aspect: Aspect): TextZone[] {
  // Una banda lateral en 9:16 deja columnas de texto demasiado estrechas.
  return aspect === '9:16' ? ['top', 'bottom'] : ['top', 'bottom', 'left']
}

export interface Band { x: number; y: number; width: number; height: number }

export function textBand(aspect: Aspect, zone: TextZone): Band {
  const { width: W, height: H } = CANVAS[aspect]
  const safe = aspect === '9:16' ? STORY_SAFE : MARGIN
  const bandH = Math.round(H * (aspect === '9:16' ? 0.30 : 0.38))

  if (zone === 'left') {
    return { x: MARGIN, y: MARGIN, width: Math.round(W * 0.52) - MARGIN, height: H - MARGIN * 2 }
  }
  if (zone === 'top') {
    return { x: MARGIN, y: safe, width: W - MARGIN * 2, height: bandH }
  }
  return { x: MARGIN, y: H - safe - bandH, width: W - MARGIN * 2, height: bandH }
}

/** La zona pedida si el formato la admite; si no, la primera admitida. */
export function resolveZone(aspect: Aspect, zone: TextZone): TextZone {
  const allowed = allowedZones(aspect)
  return allowed.includes(zone) ? zone : allowed[0]
}
