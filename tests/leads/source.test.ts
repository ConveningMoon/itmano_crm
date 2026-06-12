import { describe, it, expect } from 'vitest'
import { getLeadSource, LEAD_SOURCE_FILTER_OPTIONS } from '@/lib/leads/source'

describe('getLeadSource — channel-backed', () => {
  it('lead_magnet / event / contact_form map to their labels (traffic ignored)', () => {
    expect(getLeadSource('lead_magnet', 'direct')).toEqual({ kind: 'lead_magnet', label: 'Lead Magnet' })
    expect(getLeadSource('event', null)).toEqual({ kind: 'event', label: 'Evento' })
    expect(getLeadSource('contact_form', 'instagram')).toEqual({ kind: 'contact_form', label: 'Formulario Web' })
  })

  it('legacy channels (manual / manychat_flow) map for display only', () => {
    expect(getLeadSource('manual', 'direct')).toEqual({ kind: 'manual', label: 'Registro manual' })
    expect(getLeadSource('manychat_flow', null)).toEqual({ kind: 'manychat', label: 'ManyChat' })
  })
})

describe('getLeadSource — direct entry (no channel)', () => {
  it('maps the 4 direct-entry traffic sources', () => {
    expect(getLeadSource(null, 'direct')).toEqual({ kind: 'manual', label: 'Registro manual' })
    expect(getLeadSource(null, 'instagram')).toEqual({ kind: 'instagram', label: 'Instagram' })
    expect(getLeadSource(null, 'facebook')).toEqual({ kind: 'facebook', label: 'Facebook' })
    expect(getLeadSource(null, 'whatsapp')).toEqual({ kind: 'whatsapp', label: 'WhatsApp' })
  })

  it('other known traffic sources → kind "other" with a label', () => {
    expect(getLeadSource(null, 'referral')).toEqual({ kind: 'other', label: 'Referido' })
    expect(getLeadSource(null, 'ads_meta')).toEqual({ kind: 'other', label: 'Ads (Meta)' })
    expect(getLeadSource(null, 'unknown')).toEqual({ kind: 'other', label: 'Desconocido' })
  })

  it('null / unrecognized traffic → kind "other" with em dash', () => {
    expect(getLeadSource(null, null)).toEqual({ kind: 'other', label: '—' })
    expect(getLeadSource(null, 'something_new')).toEqual({ kind: 'other', label: '—' })
  })
})

describe('getLeadSource — matches the 3 real combos in the DB', () => {
  // From the FASE 0 inventory: 5×(null,direct), 1×(lead_magnet,direct), 1×(null,instagram)
  it('all three resolve to a filterable kind', () => {
    expect(getLeadSource(null, 'direct').kind).toBe('manual')
    expect(getLeadSource('lead_magnet', 'direct').kind).toBe('lead_magnet')
    expect(getLeadSource(null, 'instagram').kind).toBe('instagram')
  })
})

describe('LEAD_SOURCE_FILTER_OPTIONS', () => {
  it('has exactly the 7 source options', () => {
    expect(LEAD_SOURCE_FILTER_OPTIONS.map(o => o.value)).toEqual([
      'manual', 'instagram', 'facebook', 'whatsapp', 'lead_magnet', 'event', 'contact_form',
    ])
  })
})
