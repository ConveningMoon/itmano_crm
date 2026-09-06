import { describe, it, expect } from 'vitest'
import { columns } from '@/lib/supabase/columns'

// El fallo que este contrato existe para impedir: la migración 082 quitó
// `attention_when` de `leads_list`, el `.select()` siguió pidiéndola y /leads
// dejó de cargar en producción. Era un string que nadie validaba.
//
// La comprobación de verdad es de TIPOS, así que la hace `npx tsc --noEmit` a
// través de los @ts-expect-error de abajo: si un nombre inválido dejara de dar
// error, tsc fallaría por un @ts-expect-error sin usar. Estos tests cubren el
// resto — que el string que sale sea el que PostgREST espera.

describe('columns() — el string de select', () => {
  it('une los nombres como los quiere PostgREST', () => {
    expect(columns('leads_list', ['id', 'stage', 'urgency_rank']))
      .toBe('id, stage, urgency_rank')
  })

  it('respeta el orden que se le pasa', () => {
    expect(columns('leads', ['email', 'id'])).toBe('email, id')
  })

  it('una sola columna no lleva separador', () => {
    expect(columns('leads', ['id'])).toBe('id')
  })
})

describe('columns() — columnas inexistentes no compilan', () => {
  it('rechaza la columna que rompió producción', () => {
    // @ts-expect-error attention_when se retiró de leads_list en la 082
    const s = columns('leads_list', ['id', 'attention_when'])
    expect(s).toContain('id')
  })

  it('rechaza una columna de otra relación', () => {
    // `channel_type` existe en acquisition_channels, no en leads.
    // @ts-expect-error columna de otra tabla
    const s = columns('leads', ['id', 'channel_type'])
    expect(s).toContain('id')
  })

  it('rechaza `status`, que se borró en la 083', () => {
    // @ts-expect-error leads.status ya no existe
    const s = columns('leads', ['id', 'status'])
    expect(s).toContain('id')
  })

  it('rechaza una relación que no existe', () => {
    // @ts-expect-error no hay tabla ni vista con ese nombre
    const s = columns('leads_lista', ['id'])
    expect(s).toBe('id')
  })
})
