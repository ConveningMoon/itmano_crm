import { describe, expect, it } from 'vitest'
import { resolveSettingsTab, settingsNavForRole } from '@/lib/settings/nav'

const values = (role: Parameters<typeof settingsNavForRole>[0]) =>
  settingsNavForRole(role).flatMap(g => g.items.map(i => i.value))

describe('settingsNavForRole', () => {
  it('super_admin ve Equipo, Negocio, Comunicación y Sistema en ese orden', () => {
    const nav = settingsNavForRole('super_admin')
    expect(nav.map(g => g.group)).toEqual(['Equipo', 'Negocio', 'Comunicación', 'Sistema'])
    expect(nav.map(g => g.items.map(i => i.value))).toEqual([
      ['perfil', 'agentes'],
      ['negocio', 'etiquetas'],
      ['email'],
      ['scoring', 'ia', 'cuenta'],
    ])
  })

  it('dentro de Sistema el orden es Scoring, Uso de IA, Cuenta y acceso', () => {
    const sistema = settingsNavForRole('super_admin').find(g => g.group === 'Sistema')
    expect(sistema?.items.map(i => i.label)).toEqual(['Scoring', 'Uso de IA', 'Cuenta y acceso'])
  })

  it('usa las etiquetas acordadas', () => {
    const labels = settingsNavForRole('super_admin').flatMap(g => g.items.map(i => i.label))
    expect(labels).toEqual([
      'Perfil del equipo', 'Agentes', 'Tu negocio', 'Etiquetas', 'Email', 'Scoring', 'Uso de IA', 'Cuenta y acceso',
    ])
  })

  it('agent_owner no ve Scoring', () => {
    expect(values('agent_owner')).not.toContain('scoring')
    expect(values('agent_owner')).toEqual(['perfil', 'agentes', 'negocio', 'etiquetas', 'email', 'ia', 'cuenta'])
  })

  it('agent ve Perfil, Agentes, Email, Uso de IA y Cuenta; el grupo Negocio desaparece', () => {
    const nav = settingsNavForRole('agent')
    expect(values('agent')).toEqual(['perfil', 'agentes', 'email', 'ia', 'cuenta'])
    expect(nav.map(g => g.group)).toEqual(['Equipo', 'Comunicación', 'Sistema'])
  })

  it('cada item lleva el nombre de un icono de lucide', () => {
    for (const g of settingsNavForRole('super_admin')) {
      for (const item of g.items) expect(item.icon).toMatch(/^[A-Z][A-Za-z0-9]+$/)
    }
  })
})

describe('resolveSettingsTab', () => {
  it('valor válido para el rol se conserva', () => {
    expect(resolveSettingsTab('scoring', 'super_admin')).toBe('scoring')
    expect(resolveSettingsTab('negocio', 'agent_owner')).toBe('negocio')
    expect(resolveSettingsTab('email', 'agent')).toBe('email')
  })

  it('null, desconocido o no permitido cae en perfil', () => {
    expect(resolveSettingsTab(null, 'agent')).toBe('perfil')
    expect(resolveSettingsTab('nada', 'super_admin')).toBe('perfil')
    expect(resolveSettingsTab('scoring', 'agent_owner')).toBe('perfil')
    expect(resolveSettingsTab('negocio', 'agent')).toBe('perfil')
    expect(resolveSettingsTab('etiquetas', 'agent')).toBe('perfil')
  })
})
