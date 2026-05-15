export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  new:               { label: 'Nuevo',             color: '#5B8EC9', bgColor: 'rgba(91,142,201,0.12)' },
  nurturing:         { label: 'Nurturing',          color: '#C9A96E', bgColor: 'rgba(201,169,110,0.12)' },
  warm:              { label: 'Tibio',              color: '#E07B3A', bgColor: 'rgba(224,123,58,0.12)' },
  hot:               { label: 'Caliente',           color: '#E04040', bgColor: 'rgba(224,64,64,0.12)' },
  process_started:   { label: 'En Proceso',         color: '#9B72CF', bgColor: 'rgba(155,114,207,0.12)' },
  process_completed: { label: 'Proceso Completado', color: '#6BA368', bgColor: 'rgba(107,163,104,0.12)' },
  closed:            { label: 'Cerrado',            color: '#4A9B6B', bgColor: 'rgba(74,155,107,0.12)' },
  lost:              { label: 'Perdido',            color: '#C97B6B', bgColor: 'rgba(201,123,107,0.12)' },
}

export const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  lead_magnet: { label: 'Lead Magnet',    icon: '📄' },
  web_form:    { label: 'Formulario Web', icon: '🌐' },
  open_house:  { label: 'Open House',    icon: '🏠' },
  manual:      { label: 'Reg. Manual',   icon: '✍️' },
  ads:         { label: 'Meta Ads',      icon: '📣' },
  referral:    { label: 'Referido',      icon: '🤝' },
}

export const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  es: { label: 'Español',   flag: '🇪🇸' },
  en: { label: 'English',   flag: '🇺🇸' },
  pt: { label: 'Português', flag: '🇧🇷' },
}
