import { describe, it, expect } from 'vitest'
import { aggregateStats } from '@/lib/data/newsletter-stats'

describe('aggregateStats', () => {
  const ediciones = [
    { id: 'e1', status: 'published' as const },
    { id: 'e2', status: 'published' as const },
    { id: 'e3', status: 'draft' as const },
  ]

  it('cuenta vistas por edición y en total', () => {
    const r = aggregateStats(ediciones, [
      { edition_id: 'e1' }, { edition_id: 'e1' }, { edition_id: 'e2' },
    ], [])
    expect(r.byEdition.get('e1')?.views).toBe(2)
    expect(r.byEdition.get('e2')?.views).toBe(1)
    expect(r.byEdition.get('e3')?.views).toBe(0)
    expect(r.totals.views).toBe(3)
  })

  it('no cuenta vistas de ediciones que ya no existen', () => {
    // El FK es ON DELETE CASCADE, así que no debería pasar — pero una vista
    // huérfana no puede inflar el total del tenant.
    const r = aggregateStats(ediciones, [{ edition_id: 'borrada' }], [])
    expect(r.totals.views).toBe(0)
  })

  it('atribuye suscriptores a la edición que los captó', () => {
    const r = aggregateStats(ediciones, [], [
      { edition_id: 'e1' }, { edition_id: null }, { edition_id: 'e1' },
    ])
    expect(r.byEdition.get('e1')?.subscribers).toBe(2)
    // El de edition_id null se suscribió desde la portada: cuenta en el total
    // del tenant, no en ninguna edición.
    expect(r.totals.subscribers).toBe(3)
  })

  it('separa publicadas de borradores, y las archivadas no cuentan en ninguna', () => {
    const conArchivada = [...ediciones, { id: 'e4', status: 'archived' as const }]
    const r = aggregateStats(conArchivada, [], [])
    expect(r.totals.published).toBe(2)
    expect(r.totals.drafts).toBe(1)
  })

  it('toda edición aparece en byEdition, aunque esté a cero', () => {
    // La lista del CRM pinta una fila por edición: si el mapa no la trae, la
    // celda queda vacía en vez de decir 0.
    const r = aggregateStats(ediciones, [], [])
    for (const e of ediciones) {
      expect(r.byEdition.get(e.id)).toEqual({ views: 0, subscribers: 0 })
    }
  })
})
