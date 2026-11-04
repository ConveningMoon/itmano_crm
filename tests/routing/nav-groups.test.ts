import { describe, expect, it } from 'vitest'
import { navGroups, navGroupsForRole, navItems, navItemsForRole } from '@/components/layout/nav-items'

describe('grupos del sidebar', () => {
  it('tenant: grupos en orden', () => {
    expect(navGroups.map(g => g.label)).toEqual(['Trabajo', 'Marketing', 'Cuenta'])
    expect(navGroups[0].items.map(i => i.href)).toEqual(['/dashboard', '/leads', '/properties', '/analytics'])
    expect(navGroups[1].items.map(i => i.href)).toEqual(['/newsletters', '/sources', '/emails', '/studio'])
    expect(navGroups[2].items.map(i => i.href)).toEqual(['/settings', '/soporte'])
  })

  it('agent_owner y agent ven exactamente el fallback del shell', () => {
    expect(navGroupsForRole('agent_owner')).toEqual(navGroups)
    expect(navGroupsForRole('agent')).toEqual(navGroups)
  })

  it('navItems es la lista plana de los grupos', () => {
    expect(navItems).toEqual(navGroups.flatMap(g => g.items))
  })

  it('super_admin añade Administración y abre Estudio', () => {
    const groups = navGroupsForRole('super_admin')
    expect(groups.at(-1)?.label).toBe('Administración')
    expect(groups.at(-1)?.items.map(i => i.href)).toEqual(['/admin', '/solicitudes'])
    expect(groups.flatMap(g => g.items).find(i => i.href === '/studio')?.badgeLabel).toBeUndefined()
  })

  it('el Estudio sigue en Pronto para un tenant', () => {
    expect(navGroups.flatMap(g => g.items).find(i => i.href === '/studio')?.badgeLabel).toBe('Pronto')
  })

  it('modo hub conserva sus 4 rutas', () => {
    expect(navItemsForRole('super_admin', { hubMode: true }).map(i => i.href))
      .toEqual(['/admin', '/studio', '/solicitudes', '/notifications'])
  })
})
