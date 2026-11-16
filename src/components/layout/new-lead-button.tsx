'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

// "Registrar Lead" del topbar. Es también el fallback de su slot: casi todo el
// mundo lo ve, así que el shell lo pinta desde el principio y sólo desaparece
// para el super_admin en modo hub (NewLeadSlot).
export function NewLeadButton() {
  const router = useRouter()
  // No es un <Link>, así que nada lo precargaba y el clic esperaba al servidor
  // (~1 s) antes de pintar algo. La precarga trae sólo el shell estático de
  // /leads/new (sin tocar la base): el skeleton sale al instante.
  useEffect(() => { router.prefetch('/leads/new') }, [router])
  return (
    <button
      type="button"
      className="btn btn-primary btn-cta"
      onClick={() => router.push('/leads/new')}
      aria-label="Registrar lead"
    >
      <Plus size={14} strokeWidth={2} aria-hidden="true" />
      {/* Label collapses to an icon-only button on phones; full text at sm:+. */}
      <span className="hidden sm:inline">Registrar lead</span>
    </button>
  )
}
