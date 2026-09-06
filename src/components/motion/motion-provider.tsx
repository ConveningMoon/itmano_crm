'use client'

import { LazyMotion, MotionConfig, domMax } from 'motion/react'

// Mounted once in the root layout. `domMax` (not domAnimation) because the nav
// active indicator uses layoutId, which needs layout animations. `strict` makes
// any accidental `motion.*` import throw in dev, keeping the bundle at m.* size.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
