'use client'

import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { setTenantLeadScoring } from './actions'

// Toggle del análisis de fit con IA por tenant (centro de control). Optimista:
// refleja el cambio al instante y revierte si la server action falla.
export function LeadScoringToggle({ tenantId, initial }: { tenantId: string; initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  function toggle(next: boolean) {
    setOn(next)
    setError(null)
    start(async () => {
      const res = await setTenantLeadScoring(tenantId, next)
      if (!res.ok) { setOn(!next); setError(res.error) }
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
      <Switch checked={on} onChange={toggle} aria-label="Análisis de fit con IA" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <Sparkles size={13} color="var(--accent-gold)" /> Análisis de fit con IA
          <span style={{
            fontSize: '9px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '1px 6px', borderRadius: '8px',
            color: on ? 'var(--accent-green)' : 'var(--text-muted)',
            background: on ? 'rgba(107,163,104,0.14)' : 'var(--bg-surface)',
          }}>
            {on ? 'Activo' : 'Apagado'}
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.45 }}>
          Reinterpreta el fit de los leads nuevos con IA (fase de prueba).
        </div>
        {error && <div style={{ fontSize: '11px', color: 'var(--accent-coral)', marginTop: '4px' }}>{error}</div>}
      </div>
    </div>
  )
}
