import type React from 'react'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// Estilos compartidos por las secciones de /settings. Temporal: desaparece
// cuando las secciones pasen a clases y tokens propios.

// ─── Style constants ──────────────────────────────────────────────────────────

export const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

export const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

export const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

export const BTN_GHOST: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: '12px',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
}

export const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
}

export const CARD_HEADER: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
}

// Idiomas desde la fuente única (config). Reemplaza a la lista fija es/en/pt.
export const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGE_CODES.map(code => ({
  value: code,
  label: LANGUAGE_CONFIG[code].label,
}))
