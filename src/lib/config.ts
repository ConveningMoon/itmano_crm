import type { LeadStatus, Language } from './types'

export const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bgColor: string }> = {
  new:               { label: 'Nuevo',             color: '#5B8EC9', bgColor: 'rgba(91,142,201,0.12)' },
  nurturing:         { label: 'Nurturing',          color: '#C9A96E', bgColor: 'rgba(201,169,110,0.12)' },
  warm:              { label: 'Tibio',              color: '#E07B3A', bgColor: 'rgba(224,123,58,0.12)' },
  hot:               { label: 'Caliente',           color: '#E04040', bgColor: 'rgba(224,64,64,0.12)' },
  process_started:   { label: 'En Proceso',         color: '#9B72CF', bgColor: 'rgba(155,114,207,0.12)' },
  process_completed: { label: 'Proceso Completado', color: '#6BA368', bgColor: 'rgba(107,163,104,0.12)' },
  closed:            { label: 'Cerrado',            color: '#4A9B6B', bgColor: 'rgba(74,155,107,0.12)' },
  lost:              { label: 'Perdido',            color: '#C97B6B', bgColor: 'rgba(201,123,107,0.12)' },
}


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
