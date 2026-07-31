// Vocabulario del modelo de fit: qué dimensiones existen, qué buckets admite
// cada una, y cuáles aplican a un comprador y cuáles a un vendedor.
//
// Vive en un módulo PURO (sin 'server-only') a propósito: lo consumen el
// servicio de fit con IA —que corre en servidor— y el cálculo de alcance de la
// pantalla de Ajustes —que corre en el cliente para dar feedback mientras se
// escriben los puntos. Tenerlo en un solo lugar evita la clase de bug que ya
// nos costó caro: dos copias de la misma verdad que se separan con el tiempo.
//
// Los buckets deben coincidir con `match_value` en lead_score_rules (migración
// 029). Cambiar el vocabulario es un cambio de código Y de datos.

export const BUCKETS = {
  timeline:        ['under_3_months', '3_6_months', '6_12_months', 'over_12_explorando'],
  financing:       ['cash', 'preapproved', 'in_process', 'not_started'],
  budget_tier:     ['premium', 'mid', 'entry', 'undefined'],
  agent_status:    ['sin_agente', 'con_agente'],
  sell_motivation: ['alta', 'media', 'baja'],
  listing_status:  ['no_listado_sin_agente', 'ya_listado_con_agente'],
} as const

export type Dimension = keyof typeof BUCKETS

// Un lead es comprador O vendedor, nunca ambos: los dos conjuntos son excluyentes
// y comparten `timeline`. Por eso el mejor fit posible es el MAYOR de los dos
// caminos, no la suma de todas las dimensiones.
export const BUY_DIMS:  Dimension[] = ['timeline', 'financing', 'budget_tier', 'agent_status']
export const SELL_DIMS: Dimension[] = ['sell_motivation', 'timeline', 'listing_status']

export const DIM_LABEL: Record<Dimension, string> = {
  timeline:        'Horizonte de compra/venta',
  financing:       'Situación de financiamiento',
  budget_tier:     'Nivel de presupuesto RELATIVO al mercado de la agencia',
  agent_status:    '¿Ya trabaja con otro agente?',
  sell_motivation: 'Motivación de venta',
  listing_status:  'Estado del listado',
}
