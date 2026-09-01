'use client'

import { useEffect } from 'react'

// Beacon de vista de la edición — igual patrón que hosted-form.tsx:102
// (fetch con `text/plain` + `keepalive` para no disparar preflight ni
// bloquear la navegación si el visitante cierra la pestaña). Se dispara una
// sola vez al montar; el servidor decide si cuenta o no (edición publicada,
// dedup por visitante).

const VISITOR_KEY = 'itmano_visitor_id'

function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(VISITOR_KEY, id)
    }
    return id
  } catch {
    return 'anon'
  }
}

export function EditionViewBeacon({ editionId }: { editionId: string }) {
  useEffect(() => {
    try {
      fetch('/api/newsletters/view', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ editionId, visitorId: visitorId() }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* nunca romper la página por el beacon */ }
  }, [editionId])

  return null
}
