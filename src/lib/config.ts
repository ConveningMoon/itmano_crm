import type { Language } from './types'

// STATUS_CONFIG se retiró en la migración 082: `leads.status` mezclaba la etapa
// del embudo con la medición, y ahora son dos cosas separadas. Las etiquetas de
// etapa viven en STAGE_CONFIG y las de calidad en QUALITY_CONFIG, ambas en
// src/lib/scoring/priority.ts.

// Idiomas soportados (migración 062). Debe coincidir con el type Language y con
// el CHECK de la base. Para agregar uno: extender aquí, el type y un CHECK nuevo.
export const LANGUAGE_CONFIG: Record<Language, { label: string; flag: string }> = {
  es: { label: 'Español',            flag: '🇪🇸' },
  en: { label: 'English',            flag: '🇺🇸' },
  pt: { label: 'Português',          flag: '🇧🇷' },
  fr: { label: 'Français',           flag: '🇫🇷' },
  de: { label: 'Deutsch',            flag: '🇩🇪' },
  it: { label: 'Italiano',           flag: '🇮🇹' },
  zh: { label: '中文',                flag: '🇨🇳' },
  ja: { label: '日本語',              flag: '🇯🇵' },
  ko: { label: '한국어',              flag: '🇰🇷' },
  ru: { label: 'Русский',            flag: '🇷🇺' },
  ar: { label: 'العربية',            flag: '🇸🇦' },
  hi: { label: 'हिन्दी',               flag: '🇮🇳' },
  vi: { label: 'Tiếng Việt',         flag: '🇻🇳' },
  tl: { label: 'Tagalog',            flag: '🇵🇭' },
  ht: { label: 'Kreyòl Ayisyen',     flag: '🇭🇹' },
  pl: { label: 'Polski',             flag: '🇵🇱' },
  uk: { label: 'Українська',         flag: '🇺🇦' },
  tr: { label: 'Türkçe',             flag: '🇹🇷' },
  nl: { label: 'Nederlands',         flag: '🇳🇱' },
}

// Lista ordenada de códigos — para selects/checkboxes en la UI.
export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_CONFIG) as Language[]
