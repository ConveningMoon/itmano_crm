// Datos de demostración de la landing. Todos ficticios: ningún nombre, correo
// ni dirección pertenece a un lead o a un tenant real. Los correos usan
// example.com y la marca del cliente es siempre "tu agencia".

export type DemoAction = 'hoy' | 'escribir' | 'semana'
export type DemoTone = 'gold' | 'blue' | 'teal' | 'coral' | 'pink' | 'green'

export interface DemoLead {
  id: string
  name: string
  source: string
  action: DemoAction
  /** Cercanía a firmar, 0–100. Sólo ordena la demo. */
  score: number
  tone: DemoTone
}

export const ACTION_LABEL: Record<DemoAction, string> = {
  hoy: 'Llamar hoy',
  escribir: 'Escribir',
  semana: 'Esta semana',
}

// Los tres primeros son el estado inicial de la lista (el que viene en el HTML).
export const HERO_LEADS: DemoLead[] = [
  { id: 'mariana', name: 'Mariana González', source: 'Guía para vendedores', action: 'hoy', score: 94, tone: 'gold' },
  { id: 'valeria', name: 'Valeria Pardo', source: 'Valoración gratuita', action: 'hoy', score: 86, tone: 'teal' },
  { id: 'andres', name: 'Andrés Molina', source: 'Formulario de tu web', action: 'escribir', score: 71, tone: 'blue' },
  { id: 'jorge', name: 'Jorge Lira', source: 'Respondió tu correo', action: 'hoy', score: 92, tone: 'coral' },
  { id: 'lucia', name: 'Lucía Ferrer', source: 'Newsletter del mes', action: 'semana', score: 63, tone: 'pink' },
  { id: 'diego', name: 'Diego Ramos', source: 'Open house del sábado', action: 'hoy', score: 89, tone: 'green' },
  { id: 'tomas', name: 'Tomás Herrera', source: 'Guía para compradores', action: 'escribir', score: 74, tone: 'blue' },
  { id: 'camila', name: 'Camila Soto', source: 'Página de captura', action: 'hoy', score: 83, tone: 'gold' },
  { id: 'paula', name: 'Paula Navarro', source: 'Instagram', action: 'semana', score: 66, tone: 'teal' },
  { id: 'ricardo', name: 'Ricardo Vega', source: 'Referido', action: 'hoy', score: 88, tone: 'coral' },
]

export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}
