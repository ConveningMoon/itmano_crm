'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { usePrefersReducedMotion } from '@/components/motion/use-prefers-reduced-motion'
import { QUALITY_CONFIG, STAGE_CONFIG, URGENCY_CONFIG, type QualityBand, type Stage, type Urgency } from '@/lib/scoring/priority'
import { initials, type DemoTone } from './demo-data'

// Piezas de interfaz de la réplica del CRM. Etiquetas y colores salen de
// src/lib/scoring/priority.ts, el mismo módulo que usa el producto: la landing
// no puede mostrar una etapa o una calidad que el CRM ya no tenga.

export function Avatar({ name, tone, size = 32 }: { name: string; tone: DemoTone; size?: number }) {
  return (
    <span
      className="crm-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), ['--tone' as string]: `var(--accent-${tone})` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function StageChip({ stage }: { stage: Stage }) {
  const c = STAGE_CONFIG[stage]
  return (
    <span className="crm-chip" style={{ color: c.color, backgroundColor: c.bg }}>
      {c.label}
    </span>
  )
}

export function QualityText({ band }: { band: QualityBand }) {
  const c = QUALITY_CONFIG[band]
  return (
    <span className="crm-quality" style={{ color: c.color }}>
      {c.label}
    </span>
  )
}

export function QualityChip({ band }: { band: QualityBand }) {
  const c = QUALITY_CONFIG[band]
  return (
    <span className="crm-chip" style={{ color: c.color, backgroundColor: `color-mix(in srgb, ${c.color} 14%, transparent)` }}>
      {c.label}
    </span>
  )
}

export function DotChip({ label, color }: { label: string; color: string }) {
  return (
    <span className="crm-dotchip">
      <i style={{ backgroundColor: color }} aria-hidden />
      {label}
    </span>
  )
}

export const stageDot = (stage: Stage) => <DotChip label={STAGE_CONFIG[stage].label} color={STAGE_CONFIG[stage].color} />
export const qualityDot = (band: QualityBand) => <DotChip label={`Calidad ${QUALITY_CONFIG[band].label.toLowerCase()}`} color={QUALITY_CONFIG[band].color} />
export const urgencyDot = (u: Urgency) => <DotChip label={URGENCY_CONFIG[u].label} color={URGENCY_CONFIG[u].color} />

/** true mientras el elemento está en pantalla y el visitante acepta movimiento. */
export function useLive(ref: React.RefObject<Element | null>, margin = '-10% 0px -10% 0px') {
  const inView = useInView(ref, { margin: margin as `${number}px` })
  const reduced = usePrefersReducedMotion()
  return inView && !reduced
}

/** true desde que el elemento entra en pantalla por primera vez (siempre con reduced motion). */
export function useArrived(ref: React.RefObject<Element | null>, amount = 0.35) {
  const inView = useInView(ref, { once: true, amount })
  const reduced = usePrefersReducedMotion()
  return inView || reduced
}

/** Intervalo que sólo corre mientras `live`; siempre llama a la última versión de onTick. */
export function useTicker(live: boolean, every: number, onTick: () => void) {
  const tick = useRef(onTick)
  useEffect(() => {
    tick.current = onTick
  })
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => tick.current(), every)
    return () => window.clearInterval(id)
  }, [live, every])
}

/**
 * Escritura progresiva de un texto, como se ve el análisis la primera vez que
 * se genera. Sin `run` devuelve el texto completo (estado final en el HTML).
 */
export function useTyped(text: string, run: boolean, charsPerTick = 3, tickMs = 18) {
  const [count, setCount] = useState(run ? 0 : text.length)
  useEffect(() => {
    if (!run) return
    let n = 0
    const id = window.setInterval(() => {
      n = Math.min(text.length, n + charsPerTick)
      setCount(n)
      if (n >= text.length) window.clearInterval(id)
    }, tickMs)
    return () => window.clearInterval(id)
  }, [text, run, charsPerTick, tickMs])
  return run ? text.slice(0, count) : text
}
