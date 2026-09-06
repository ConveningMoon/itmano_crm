// Parseo del monto que declara un lead.
//
// Módulo PURO y client-safe: lo usan el intake (server-only) y el diagnóstico de
// fuentes, que se renderiza en el panel.

// Un solo número con separadores de miles/decimales en cualquier convención, y
// con sufijo k/M opcional. La ambigüedad real es "350.000": en es-ES son
// trescientos cincuenta mil y en en-US son 350 con decimales. Se resuelve por
// forma, no por locale — un grupo de EXACTAMENTE tres dígitos tras un único
// separador es separador de miles. (Un presupuesto de 350,5 no existe.)
function parseSingleAmount(raw: string): number | null {
  const s = raw.replace(/\s| /g, '')
  if (!s) return null

  // Sufijo de escala antes de tocar los separadores: "350k", "1.2M".
  const suffix = /([kK])$|([mM])$/.exec(s)
  const scale  = suffix ? (suffix[1] ? 1_000 : 1_000_000) : 1
  const body   = suffix ? s.slice(0, -1) : s

  const digits = body.replace(/[^0-9.,]/g, '')
  if (!/[0-9]/.test(digits)) return null

  let normalized: string
  const lastDot   = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')

  if (lastDot >= 0 && lastComma >= 0) {
    // Conviven los dos: el último es el decimal, el otro agrupa millares.
    const decimalSep = lastDot > lastComma ? '.' : ','
    const groupSep   = decimalSep === '.' ? ',' : '.'
    normalized = digits.split(groupSep).join('').replace(decimalSep, '.')
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null
    if (sep === null) {
      normalized = digits
    } else {
      const parts = digits.split(sep)
      const tail  = parts[parts.length - 1]
      // Más de un separador, o un grupo final de 3 dígitos → miles.
      normalized = parts.length > 2 || tail.length === 3
        ? parts.join('')
        : parts.join('.')
    }
  }

  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n) || n < 0) return null
  return n * scale
}

/**
 * Monto declarado por el lead, a partir de lo que sea que el formulario mandó.
 *
 * Acepta un número, una cadena con separadores en cualquier convención, y un
 * RANGO ("300.000 - 400.000", "entre 300k y 400k"), que se resuelve al punto
 * medio: el lead que dice "entre 300 y 400" no está declarando 300.
 *
 * `null` cuando no hay nada parseable — nunca 0, que sería afirmar que su
 * presupuesto es cero.
 */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= 0 ? raw : null
  if (typeof raw !== 'string') return null

  // Los separadores de rango se distinguen del signo menos por venir DESPUÉS de
  // un número — incluido su sufijo de escala: "300k-400k" es un rango, y sin
  // contemplar la `k` se leía como el número 300400 seguido de sufijo, o sea
  // trescientos millones. `y`/`a`/`to` van rodeados de espacios para no partir
  // cadenas tipo "1a2b3".
  const partes = raw
    .split(/(?<=[0-9kKmM\s])\s*(?:-|–|—|\bal?\b|\by\b|\bto\b|\bhasta\b)\s*(?=[0-9$€])/i)
    .map(p => parseSingleAmount(p))
    .filter((n): n is number => n !== null)

  if (partes.length === 0) return null
  if (partes.length === 1) return partes[0]
  return Math.round((Math.min(...partes) + Math.max(...partes)) / 2)
}

