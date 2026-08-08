import { describe, it, expect } from 'vitest'
import { navItems, navItemsForRole } from '@/components/layout/nav-items'

describe('navItemsForRole', () => {
  it('agent_owner y agent ven el nav estándar, con Estudio marcado como Pronto', () => {
    const items = navItemsForRole('agent_owner')
    expect(items).toEqual(navItems)
    const studio = items.find(i => i.href === '/studio')
    expect(studio).toEqual({ label: 'Estudio', href: '/studio', icon: 'Sparkles', badgeLabel: 'Pronto' })
    expect(navItemsForRole('agent')).toEqual(navItems)
    // hubMode nunca aplica a otros roles aunque se pase por error
    expect(navItemsForRole('agent_owner', { hubMode: true })).toEqual(navItems)
  })

  it('super_admin ve Estudio sin el badge Pronto', () => {
    const studio = navItemsForRole('super_admin').find(i => i.href === '/studio')
    expect(studio).toEqual({ label: 'Estudio', href: '/studio', icon: 'Sparkles' })
  })

  it('super_admin con tenant seleccionado suma centro de control + solicitudes', () => {
    const items = navItemsForRole('super_admin')
    expect(items.slice(-2)).toEqual([
      { label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' },
      { label: 'Solicitudes', href: '/solicitudes', icon: 'Inbox' },
    ])
    // Carruseles ya no es un ítem propio: vive dentro de /studio
    expect(items.some(i => i.href === '/admin/carousels')).toBe(false)
  })

  it('super_admin en modo hub colapsa a las rutas que existen sin tenant', () => {
    const items = navItemsForRole('super_admin', { hubMode: true })
    expect(items.map(i => i.href)).toEqual([
      '/admin',
      '/studio',
      '/solicitudes',
      '/notifications',
    ])
  })
})
