import { NavItem } from './nav-item'
import { navItems, type NavItemDef } from './nav-items'

// Ítems del nav del sidebar. Sin `items` pinta el nav de un tenant, que es el
// fallback del shell prerenderizado: agent_owner y agent ven exactamente esto,
// así que al llegar su sesión no cambia nada.
export function NavList({ items = navItems }: { items?: NavItemDef[] }) {
  const hrefs = items.map(i => i.href)
  return (
    <>
      {items.map(item => (
        <NavItem key={item.href} {...item} hrefs={hrefs} />
      ))}
    </>
  )
}
