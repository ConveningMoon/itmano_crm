import { describe, it, expect } from 'vitest'
import { navItems, navItemsForRole } from '@/components/layout/nav-items'

describe('navItemsForRole', () => {
  it('agent_owner and agent get the standard nav without the control center', () => {
    expect(navItemsForRole('agent_owner')).toEqual(navItems)
    expect(navItemsForRole('agent')).toEqual(navItems)
    // hubMode nunca aplica a otros roles aunque se pase por error
    expect(navItemsForRole('agent_owner', { hubMode: true })).toEqual(navItems)
  })

  it('super_admin with a selected tenant gets the standard nav plus the control center', () => {
    const items = navItemsForRole('super_admin')
    expect(items.slice(0, navItems.length)).toEqual(navItems)
    expect(items.at(-1)).toEqual({ label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' })
  })

  it('super_admin in hub mode collapses to control center + notifications', () => {
    const items = navItemsForRole('super_admin', { hubMode: true })
    expect(items.map(i => i.href)).toEqual(['/admin', '/notifications'])
  })
})
