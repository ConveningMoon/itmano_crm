import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import type { Language } from '@/lib/types'

// Validación compartida del alta manual de leads (cliente y Server Action).
//
// Antes el formulario dejaba enviar sin idioma y el INSERT chocaba con el CHECK
// `leads_language_check`: el error crudo de Postgres llegaba a la pantalla. Y un
// teléfono como "abc" se guardaba tal cual. Las dos comprobaciones viven aquí
// para que el navegador y el servidor digan exactamente lo mismo.

export type ManualLeadField = 'firstName' | 'email' | 'phone' | 'language'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Dígitos, espacios, guiones, puntos, paréntesis y un "+" inicial opcional.
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim())
}

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(value)
}

/**
 * Teléfono opcional. Devuelve el valor a guardar (espacios colapsados) o un
 * error. Exige entre 7 y 15 dígitos (máximo E.164); no impone formato de país
 * porque los tenants operan en mercados distintos.
 */
export function normalizePhone(raw: string | null | undefined):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  const trimmed = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return { ok: true, value: null }
  if (!PHONE_CHARS_RE.test(trimmed)) {
    return { ok: false, error: 'El teléfono sólo puede tener números, espacios, guiones, paréntesis y un + inicial' }
  }
  const digits = trimmed.replace(/\D/g, '').length
  if (digits < 7 || digits > 15) {
    return { ok: false, error: 'El teléfono debe tener entre 7 y 15 dígitos' }
  }
  return { ok: true, value: trimmed }
}

export interface ManualLeadFields {
  firstName: string
  email:     string
  phone:     string | null
  language:  string
}

/** Errores por campo; vacío si todo es válido. */
export function validateManualLead(input: ManualLeadFields): Partial<Record<ManualLeadField, string>> {
  const errors: Partial<Record<ManualLeadField, string>> = {}
  if (!input.firstName.trim()) errors.firstName = 'El nombre es obligatorio'
  else if (input.firstName.trim().length > 100) errors.firstName = 'El nombre es demasiado largo'
  if (!input.email.trim()) errors.email = 'El email es obligatorio'
  else if (!isValidEmail(input.email)) errors.email = 'Email no válido'
  const phone = normalizePhone(input.phone)
  if (!phone.ok) errors.phone = phone.error
  if (!isSupportedLanguage(input.language)) errors.language = 'Selecciona el idioma del lead'
  return errors
}
