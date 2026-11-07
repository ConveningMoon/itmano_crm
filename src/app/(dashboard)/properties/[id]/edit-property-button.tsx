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
        type="button"
        onClick={() => { setKey(k => k + 1); setOpen(true) }}
        className="btn btn-primary"
      >
        <Pencil size={13} aria-hidden="true" /> Editar propiedad
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
