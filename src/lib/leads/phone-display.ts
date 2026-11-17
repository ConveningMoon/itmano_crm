// Presentación y enlaces del teléfono de un lead.
//
// El CRM guarda el teléfono como lo escribió quien lo registró (validado en
// manual-input.ts o tal cual llega del formulario). Aquí sólo se decide cómo se
// ve y a dónde lleva: en el teléfono del agente, tocar el número debe llamar o
// abrir WhatsApp, no obligar a copiarlo.
//
// Los tenants actuales operan en EE. UU.: un número de 10 dígitos sin prefijo
// se trata como NANP (+1). Con "+" o con más dígitos se respeta lo escrito.

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** Número en formato internacional sin "+", o null si no se puede inferir. */
export function phoneE164Digits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = digitsOf(trimmed)
  if (digits.length < 7 || digits.length > 15) return null
  if (trimmed.startsWith('+')) return digits
  if (digits.length === 10) return `1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return digits
  return null
}

/** "(757) 582-1104" para números NANP; el resto, como se escribió. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return ''
  const e164 = phoneE164Digits(raw)
  if (e164 && e164.length === 11 && e164.startsWith('1')) {
    const n = e164.slice(1)
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  }
  return raw.trim()
}

export function phoneLinks(raw: string | null | undefined): { tel: string; whatsapp: string | null } | null {
  if (!raw || digitsOf(raw).length < 7) return null
  const e164 = phoneE164Digits(raw)
  return {
    tel:      e164 ? `tel:+${e164}` : `tel:${raw.replace(/[^\d+]/g, '')}`,
    whatsapp: e164 ? `https://wa.me/${e164}` : null,
  }
}
