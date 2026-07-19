'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import type { Property } from '@/lib/data/properties'
import { PropertyFormModal } from '../property-form-modal'

// Botón "Editar propiedad" del detalle: abre el formulario completo como modal
// EN esta misma página (antes navegaba a /properties?edit=<id>).

export function EditPropertyButton({ property, allowDelete }: { property: Property; allowDelete: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState(0)

  return (
    <>
      <button
        onClick={() => { setKey(k => k + 1); setOpen(true) }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', fontSize: '13px', fontWeight: 500,
          background: 'var(--accent-gold)', color: 'var(--bg-base)',
          borderRadius: '8px', border: 'none', cursor: 'pointer',
        }}
      >
        <Pencil size={13} /> Editar propiedad
      </button>

      {open && (
        <PropertyFormModal
          key={key}
          editing={property}
          tenants={[]}
          isSuperAdmin={false}
          allowDelete={allowDelete}
          existingSlugs={[]}
          onClose={() => { setOpen(false); router.refresh() }}
          onDeleted={() => router.push('/properties')}
        />
      )}
    </>
  )
}
