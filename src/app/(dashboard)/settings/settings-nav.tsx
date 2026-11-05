'use client'

import { useEffect, useRef } from 'react'
import { BarChart3, Building2, Gauge, KeyRound, Mail, Sparkles, Tag, Users, type LucideIcon } from 'lucide-react'
import type { SettingsNavGroup, SettingsTab } from '@/lib/settings/nav'

// `icon` en nav.ts es un nombre de lucide como string: se resuelve aquí con un
// mapa explícito para no arrastrar toda la librería al bundle.
const ICONS: Record<string, LucideIcon> = {
  BarChart3, Building2, Gauge, KeyRound, Mail, Sparkles, Tag, Users,
}

export function SettingsNav({
  groups, active, onSelect,
}: {
  groups: SettingsNavGroup[]
  active: SettingsTab
  onSelect: (tab: SettingsTab) => void
}) {
  const activeRef = useRef<HTMLButtonElement>(null)

  // En móvil la navegación es una fila con scroll: el activo debe quedar a la vista.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  return (
    <nav className="settings-nav" aria-label="Secciones">
      {groups.map(g => (
        <div key={g.group} style={{ display: 'contents' }}>
          <div className="settings-nav-group">{g.group}</div>
          {g.items.map(item => {
            const Icon = ICONS[item.icon]
            const isActive = item.value === active
            return (
              <button
                key={item.value}
                ref={isActive ? activeRef : undefined}
                type="button"
                className="settings-nav-item"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelect(item.value)}
              >
                {Icon && <Icon size={15} aria-hidden="true" />}
                {item.label}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
