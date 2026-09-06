import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { serializeLead, serializeContact } from '@/lib/agent-api/serializers/lead'
import { serializeDeal } from '@/lib/agent-api/serializers/deal'
import { LeadSchema, ContactSchema } from '@/lib/agent-api/schemas/lead'
import { DealSchema } from '@/lib/agent-api/schemas/deal'

const LEAD = {
  id: 'demo-lead-001',
  tenant_id: 'tenant-conduit-demo',
  first_name: 'Ana', last_name: "O'Neil",
  email: 'ana.oneil@example.com', phone: '+1 757 555 0142',
  language: 'es', notes: 'Pidió ver dos casas el sábado.',
  stage: 'nuevo', quality_band: 'media_alta', urgency: 'esta_semana',
  agent_id: 'demo-agent-01',
  current_score: 62, fit_score: 40, engagement_score: 18, manual_score: 4,
  budget_amount: '350000',
  created_at: '2026-01-02 03:04:05.123+00',
  updated_at: '2026-02-11 18:30:00+00',
}

const DEAL = {
  id: '11111111-2222-3333-4444-555555555555',
  lead_id: 'demo-lead-001',
  address: '1 Main St, Norfolk VA',
  loan_type: 'conventional',
  closing_date: '2026-03-15',
  notes: null,
  completed_at: null,
  created_at: '2026-02-01 10:00:00+00',
}

describe('serializeLead', () => {
  it('emite timestamps ISO en UTC con sufijo Z', () => {
    const out = serializeLead(LEAD as never, 'USD')
    expect(out.created_at).toBe('2026-01-02T03:04:05.123Z')
    expect(out.updated_at).toBe('2026-02-11T18:30:00.000Z')
  })

  it('emite dinero como string decimal con dos decimales y su moneda', () => {
    expect(serializeLead(LEAD as never, 'USD').budget)
      .toEqual({ amount: '350000.00', currency: 'USD' })
  })

  it('un presupuesto ausente sale null, no cero', () => {
    const sin = serializeLead({ ...LEAD, budget_amount: null } as never, 'USD')
    expect(sin.budget).toBeNull()
  })

  it('expone el owner como id de agente y admite que no lo haya', () => {
    expect(serializeLead(LEAD as never, 'USD').owner).toBe('demo-agent-01')
    expect(serializeLead({ ...LEAD, agent_id: null } as never, 'USD').owner).toBeNull()
  })

  it('desglosa el score en sus tres componentes', () => {
    expect(serializeLead(LEAD as never, 'USD').score)
      .toEqual({ total: 62, fit: 40, engagement: 18, manual: 4 })
  })

  it('nunca filtra tenant_id al exterior', () => {
    expect('tenant_id' in serializeLead(LEAD as never, 'USD')).toBe(false)
  })

  it('cumple su propio schema', () => {
    expect(() => LeadSchema.parse(serializeLead(LEAD as never, 'USD'))).not.toThrow()
  })
})

describe('serializeContact', () => {
  it('conserva el mismo id que el lead', () => {
    expect(serializeContact(LEAD as never).id).toBe(serializeLead(LEAD as never, 'USD').id)
  })

  it('no expone scoring, etapa ni presupuesto', () => {
    const c = serializeContact(LEAD as never) as Record<string, unknown>
    for (const campo of ['score', 'stage', 'quality_band', 'budget', 'urgency']) {
      expect(campo in c, campo).toBe(false)
    }
  })

  it('cumple su propio schema', () => {
    expect(() => ContactSchema.parse(serializeContact(LEAD as never))).not.toThrow()
  })
})

describe('serializeDeal', () => {
  it('amount es SIEMPRE null: purchase_processes no tiene importe propio', () => {
    expect(serializeDeal(DEAL as never, LEAD as never, 'USD').amount).toBeNull()
  })

  it('los campos prestados del lead llevan nombre prestado', () => {
    const out = serializeDeal(DEAL as never, LEAD as never, 'USD')
    expect(out.lead_stage).toBe('nuevo')
    expect(out.lead_budget_amount).toEqual({ amount: '350000.00', currency: 'USD' })
  })

  it('no expone stage ni budget a secas, que se confundirían con campos propios', () => {
    const out = serializeDeal(DEAL as never, LEAD as never, 'USD') as Record<string, unknown>
    expect('stage' in out).toBe(false)
    expect('budget' in out).toBe(false)
  })

  it('declara el pipeline único del CRM', () => {
    expect(serializeDeal(DEAL as never, LEAD as never, 'USD').pipeline).toBe('compra')
  })

  it('close_date sale como fecha, y null cuando no hay cierre previsto', () => {
    expect(serializeDeal(DEAL as never, LEAD as never, 'USD').close_date).toBe('2026-03-15')
    expect(serializeDeal({ ...DEAL, closing_date: null } as never, LEAD as never, 'USD').close_date)
      .toBeNull()
  })

  it('cumple su propio schema', () => {
    expect(() => DealSchema.parse(serializeDeal(DEAL as never, LEAD as never, 'USD')))
      .not.toThrow()
  })
})

describe('marcas PII en el JSON Schema generado', () => {
  type JsonSchemaProps = Record<string, Record<string, unknown>>
  const props = (s: z.ZodTypeAny): JsonSchemaProps =>
    (z.toJSONSchema(s, { target: 'draft-2020-12' }) as { properties: JsonSchemaProps }).properties

  it('marca los campos personales del lead', () => {
    const p = props(LeadSchema)
    for (const campo of ['first_name', 'last_name', 'email', 'phone', 'notes']) {
      expect(p[campo]['x-itmano-pii'], campo).toBe(true)
    }
  })

  it('NO marca como PII lo que no lo es', () => {
    const p = props(LeadSchema)
    for (const campo of ['id', 'stage', 'quality_band', 'created_at']) {
      expect(p[campo]['x-itmano-pii'], campo).toBeUndefined()
    }
  })

  it('marca la dirección y las notas del deal', () => {
    const p = props(DealSchema)
    expect(p.address['x-itmano-pii']).toBe(true)
    expect(p.notes['x-itmano-pii']).toBe(true)
  })

  it('mantiene las marcas en el contacto', () => {
    const p = props(ContactSchema)
    expect(p.email['x-itmano-pii']).toBe(true)
  })
})
