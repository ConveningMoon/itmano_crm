'use client'

import { Fragment, useLayoutEffect, useState, type ReactNode } from 'react'

/**
 * Hace que su contenido vuelva a montarse de cero cada vez que se sale de la
 * página, como antes de Cache Components.
 *
 * Con Cache Components Next conserva las páginas visitadas ocultas con
 * <Activity> en vez de desmontarlas: volver a una página la encontraba con su
 * estado de antes (la confirmación de "lead creado", un modal abierto, un
 * formulario a medias). La UI del CRM está escrita suponiendo que cada visita
 * empieza limpia.
 *
 * Cómo: el cleanup de un useLayoutEffect corre justo cuando <Activity> oculta
 * la página (es el patrón que propone la guía de Next, preserving-ui-state.md).
 * Ahí se cambia la `key` y React remonta el contenido mientras sigue oculto,
 * así que al volver ya está limpio, sin ver un instante del estado viejo. Sólo
 * se remontan los Client Components: lo que renderizó el servidor no se pide
 * otra vez.
 *
 * Se descartó `useRouter().bfcacheId` como key: la página conservada se pintaba
 * con el estado viejo hasta que llegaban los datos de la navegación nueva.
 */
export function FreshOnNavigation({ children }: { children: ReactNode }) {
  const [generation, setGeneration] = useState(0)

  useLayoutEffect(() => () => setGeneration(g => g + 1), [])

  return <Fragment key={generation}>{children}</Fragment>
}
