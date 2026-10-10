'use client'

import { useEffect } from 'react'
import { EVALUAR_CADA_MS, debeLatir } from '@/lib/warm'

/**
 * Latido que mantiene caliente la base mientras se usa el CRM (reglas y motivo
 * en src/lib/warm.ts). No pinta nada.
 *
 * Latir = un GET a /api/warm, que toca la base por el camino de una página. Se
 * hace cada ~20 s con la pestaña a la vista y actividad reciente; al volver a
 * la pestaña o al tocar algo tras una pausa, se lanza enseguida si ya toca,
 * para que el recargo de una base fría lo pague el latido y no el siguiente
 * clic.
 */
export function DbWarmer() {
  useEffect(() => {
    let ultimoLatido = 0
    let ultimaActividad = Date.now()
    let enCurso = false

    async function latir() {
      if (enCurso) return
      enCurso = true
      ultimoLatido = Date.now()
      try {
        await fetch('/api/warm', { cache: 'no-store', credentials: 'same-origin' })
      } catch {
        // Sin red o servidor caído: se reintenta en el siguiente ciclo.
      } finally {
        enCurso = false
      }
    }

    function evaluar() {
      if (debeLatir({
        ahora: Date.now(),
        ultimoLatido,
        ultimaActividad,
        visible: document.visibilityState === 'visible',
        enLinea: navigator.onLine,
      })) void latir()
    }

    function alHaberActividad() {
      ultimaActividad = Date.now()
      evaluar()
    }

    // `pointermove` y `focus` despiertan la base cuando la persona VUELVE, antes
    // de su primer clic: tras una pausa larga la base tarda ~300 ms en
    // reaccionar, y mover el ratón hacia el menú suele dar ese margen. El
    // manejador sólo compara marcas de tiempo, así que su frecuencia no cuesta.
    const eventos = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll'] as const
    for (const e of eventos) window.addEventListener(e, alHaberActividad, { passive: true, capture: true })
    window.addEventListener('focus', alHaberActividad)
    document.addEventListener('visibilitychange', evaluar)
    const intervalo = window.setInterval(evaluar, EVALUAR_CADA_MS)
    evaluar()

    return () => {
      for (const e of eventos) window.removeEventListener(e, alHaberActividad, { capture: true })
      window.removeEventListener('focus', alHaberActividad)
      document.removeEventListener('visibilitychange', evaluar)
      window.clearInterval(intervalo)
    }
  }, [])

  return null
}
