'use client'

import { useId, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'

export interface TabItem {
  key: string
  label: string
  // Conteo opcional mostrado como pill (0 se renderiza igual: "vacío" es información).
  badge?: number
}

interface TabsProps {
  items: TabItem[]
  // Contenido por key — las páginas server pasan JSX server-rendered (patrón isla).
  content: Record<string, React.ReactNode>
  // No controlado: tab inicial (default items[0].key).
  defaultKey?: string
  // Modo controlado (settings, leads/new): value + onChange.
  value?: string
  onChange?: (key: string) => void
}

// Tabs con underline dorado deslizante y crossfade de contenido. Sucesor del
// patrón lm-tabs, unificado para toda la app.
export function Tabs({ items, content, defaultKey, value, onChange }: TabsProps) {
  const [internal, setInternal] = useState(defaultKey ?? items[0]?.key)
  const active = value ?? internal
  // layoutId es global en motion: sin el uid, dos instancias de Tabs montadas a
  // la vez animarían el underline entre sí.
  const uid = useId()

  function select(key: string) {
    onChange?.(key)
    if (value === undefined) setInternal(key)
  }

  return (
    <div>
      <div
        role="tablist"
        className="max-md:overflow-x-auto"
        style={{
          display: 'flex',
          gap: '4px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '20px',
        }}
      >
        {items.map(item => {
          const isActive = item.key === active
          return (
            <button
              key={item.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => select(item.key)}
              className="shrink-0"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'color var(--dur-fast)',
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
              {item.badge !== undefined && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: isActive
                      ? 'color-mix(in srgb, var(--accent-gold) 12%, transparent)'
                      : 'var(--bg-overlay)',
                    color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
                  }}
                >
                  {item.badge}
                </span>
              )}
              {isActive && (
                <m.span
                  layoutId={`tabs-underline-${uid}`}
                  transition={{ duration: 0.22, ease: EASE_OUT_PREMIUM }}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: '-1px',
                    height: '2px',
                    background: 'var(--accent-gold)',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={active}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {content[active]}
        </m.div>
      </AnimatePresence>
    </div>
  )
}
