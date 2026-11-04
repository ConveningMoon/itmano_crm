import { NavItem } from './nav-item'
import { navGroups, type NavGroupDef } from './nav-items'

// Ítems del nav por grupos. Sin `groups` pinta el nav de un tenant, que es el
// fallback del shell prerenderizado: agent_owner y agent ven exactamente esto,
// así que al llegar su sesión no cambia nada.
export function NavList({ groups = navGroups, indicatorId }: { groups?: NavGroupDef[]; indicatorId?: string }) {
  // La lista completa: el activo se resuelve por el prefijo más largo de TODO el
  // nav, no sólo del grupo.
  const hrefs = groups.flatMap(g => g.items.map(i => i.href))
  return (
    <>
      {groups.map(group => (
        <div key={group.label ?? 'nav'} className="nav-group">
          {group.label && <div className="nav-group-label">{group.label}</div>}
          {group.items.map(item => (
            <NavItem key={item.href} {...item} hrefs={hrefs} indicatorId={indicatorId} />
          ))}
        </div>
      ))}
    </>
  )
}
