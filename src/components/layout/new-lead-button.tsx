'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

// "Registrar Lead" del topbar. Es también el fallback de su slot: casi todo el
// mundo lo ve, así que el shell lo pinta desde el principio y sólo desaparece
// para el super_admin en modo hub (NewLeadSlot).
export function NewLeadButton() {
  const router = useRouter()
  return (
    <button
      className="btn-cta"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '7px 14px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: 'var(--accent-gold)',
        color: 'var(--bg-base)',
        fontSize: '12px',
        fontWeight: '600',
        letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
      onClick={() => router.push('/leads/new')}
      aria-label="Registrar Lead"
    >
      <Plus size={14} strokeWidth={2} />
      {/* Label collapses to an icon-only button on phones; full text at sm:+. */}
      <span className="hidden sm:inline">Registrar Lead</span>
    </button>
  )
}
