// Título de cada sección del dashboard: el del topbar y el de la pestaña del
// navegador salen de aquí. Antes el topbar sólo conocía seis rutas exactas y
// Propiedades, Fuentes, Emails o cualquier detalle mostraban "ITMANO CRM", y
// todas las pestañas del navegador se llamaban igual.
//
// Orden: la ruta más específica gana (prefijo más largo).

export const DEFAULT_PAGE_TITLE = 'ITMANO CRM'

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard':                'Dashboard',
  '/leads':                    'Leads',
  '/leads/new':                'Registrar lead',
  '/properties':               'Propiedades',
  '/newsletters':              'Newsletters',
  '/newsletters/nueva':        'Nueva edición',
  '/sources':                  'Fuentes',
  '/emails':                   'Emails',
  '/emails/new':               'Nueva secuencia',
  '/emails/grupales':          'Correo grupal',
  '/studio':                   'Estudio',
  '/studio/plantillas':        'Plantillas del Estudio',
  '/settings':                 'Configuración',
  '/soporte':                  'Soporte',
  '/activity':                 'Actividad',
  '/notifications':            'Notificaciones',
  '/admin':                    'Centro de control',
  '/solicitudes':              'Solicitudes',
}

export function pageTitleFor(pathname: string): string {
  let best: string | null = null
  for (const route of Object.keys(ROUTE_TITLES)) {
    if (pathname === route || pathname.startsWith(route + '/')) {
      if (!best || route.length > best.length) best = route
    }
  }
  return best ? ROUTE_TITLES[best] : DEFAULT_PAGE_TITLE
}

/** `metadata` estática de una página: el layout del dashboard añade " · ITMANO CRM". */
export function pageMetadata(route: string): { title: string } {
  return { title: pageTitleFor(route) }
}
