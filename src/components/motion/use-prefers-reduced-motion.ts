'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// recharts no obedece a MotionConfig — sus series se gatean a mano con esto
// (isAnimationActive={!reduced}). SSR asume motion permitido (false).
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe => {
      const mq = window.matchMedia(QUERY)
      mq.addEventListener('change', subscribe)
      return () => mq.removeEventListener('change', subscribe)
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
