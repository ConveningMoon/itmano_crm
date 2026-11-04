import { parseEmailContent } from '@/lib/email-content'

// Estado de un correo de cierre. Es lógica pura: la usan el panel (cliente) para
// pintar cada celda y la página (servidor) para saber si la pestaña "De cierre"
// debe avisar de que falta algo, así que las dos cuentan lo mismo.

export interface PurchaseStateRow {
  resend_template_id: string
  subject:            string | null
  body_json:          unknown
  language:           string
}

export type PurchaseCellState = 'crm' | 'template' | 'empty'

export function isPlaceholder(id: string): boolean {
  return !id || id.startsWith('REPLACE_ME')
}

// Contenido del CRM, template de Resend o sin configurar.
export function cellState(row: Pick<PurchaseStateRow, 'resend_template_id' | 'subject' | 'body_json'>): PurchaseCellState {
  if (parseEmailContent(row.body_json) && row.subject?.trim()) return 'crm'
  if (!isPlaceholder(row.resend_template_id)) return 'template'
  return 'empty'
}

// Versiones sin configurar de un agente. Sólo cuentan los idiomas que atiende:
// las filas de otros idiomas existen (aprovisionamiento) pero el panel no las muestra.
export function countMissingClosing(agent: { languages: string[]; templates: PurchaseStateRow[] }): number {
  return agent.templates.filter(t => agent.languages.includes(t.language) && cellState(t) === 'empty').length
}
