import { describe, expect, it } from 'vitest'
import { bucketLabel, parseDashboardParams, tabUsesPeriod, visibleTabs } from '@/lib/dashboard/params'
import { DEFAULT_PERIOD, PERIODS } from '@/lib/dashboard/period'

const ALL = { canSeeAgents: true, canSeeNewsletter: true }

describe('parseDashboardParams', () => {
  it('usa general y 28 días por defecto', () => {
    expect(parseDashboardParams({}, ALL)).toEqual({ tab: 'general', period: 28 })
  })
  it('descarta valores inválidos', () => {
    expect(parseDashboardParams({ tab: 'xxx', periodo: '30' }, ALL)).toEqual({ tab: 'general', period: 28 })
  })
  it('acepta pestaña y periodo válidos', () => {
    expect(parseDashboardParams({ tab: 'emails', periodo: '91' }, ALL)).toEqual({ tab: 'emails', period: 91 })
  })
  it('toma el primer valor de un arreglo', () => {
    expect(parseDashboardParams({ tab: ['fuentes', 'x'] }, ALL).tab).toBe('fuentes')
  })
  it('oculta pestañas sin permiso', () => {
    expect(parseDashboardParams({ tab: 'agentes' }, { canSeeAgents: false, canSeeNewsletter: true }).tab).toBe('general')
    expect(parseDashboardParams({ tab: 'newsletter' }, { canSeeAgents: true, canSeeNewsletter: false }).tab).toBe('general')
  })
})

describe('visibleTabs y periodos', () => {
  it('omite las pestañas sin permiso', () => {
    expect(visibleTabs({ canSeeAgents: false, canSeeNewsletter: true }).map(t => t.key)).toEqual(['general', 'emails', 'fuentes', 'newsletter'])
  })
  it('sólo emails y fuentes usan periodo', () => {
    expect(['general', 'agentes', 'emails', 'fuentes', 'newsletter'].filter(t => tabUsesPeriod(t as never))).toEqual(['emails', 'fuentes'])
  })
  it('define los periodos', () => {
    expect(DEFAULT_PERIOD).toBe(28)
    expect(PERIODS.map(p => [p.days, p.label, p.bucketDays])).toEqual([[7, '7 días', 1], [28, '4 semanas', 7], [91, '13 semanas', 7]])
  })
})

describe('bucketLabel', () => {
  it('formatea días', () => {
    expect(bucketLabel('2026-10-29', 1)).toBe('jue 29')
  })
  it('formatea semanas', () => {
    expect(bucketLabel('2026-10-08', 7)).toBe('8–14 oct')
    expect(bucketLabel('2026-10-29', 7)).toBe('29 oct–4 nov')
  })
})
