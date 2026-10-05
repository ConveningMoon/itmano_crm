import type { ReactNode } from 'react'
import { FreshOnNavigation } from './fresh-on-navigation'

/**
 * Envuelve una página del dashboard para que empiece de cero en cada visita,
 * como antes de Cache Components (ver FreshOnNavigation). Toda página de
 * (dashboard) exporta `freshOnNavigation(SuPágina)`.
 *
 * La UI del CRM está escrita suponiendo que cada visita empieza limpia. Si una
 * página nueva quiere conservar su estado al volver (un borrador largo, filtros
 * que no van en la URL), que no se envuelva y resetee a mano lo transitorio,
 * como explica node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md.
 */
export function freshOnNavigation<P extends object>(
  Page: (props: P) => ReactNode | Promise<ReactNode>,
) {
  function FreshPage(props: P) {
    return (
      <FreshOnNavigation>
        <Page {...props} />
      </FreshOnNavigation>
    )
  }
  FreshPage.displayName = `FreshOnNavigation(${Page.name || 'Page'})`
  return FreshPage
}
