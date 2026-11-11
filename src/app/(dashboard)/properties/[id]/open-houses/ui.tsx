// Estilos y piezas visuales compartidas por la UI de open houses del CRM.
// Mismos tokens que el resto del dashboard (property-page-options, composer).
// Sin hooks: sirve igual en componentes de servidor y de cliente.

import type { OpenHouseDisplayState, OpenHouseEmailStatus } from '@/lib/open-houses/model'
import { DISPLAY_STATE_LABEL, EMAIL_STATUS_LABEL } from '@/lib/open-houses/model'

export const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
}

export const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '13px',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

export const LABEL: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
}

export const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px', fontWeight: 500, color: 'var(--bg-base)',
  background: 'var(--gold-2)', border: 'none', borderRadius: '8px', cursor: 'pointer',
}

export const BTN_GHOST: React.CSSProperties = {
  padding: '7px 14px', fontSize: '12px', color: 'var(--text-secondary)',
  background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
}

export const BTN_DANGER: React.CSSProperties = {
  ...BTN_GHOST, color: 'var(--alert)', borderColor: 'color-mix(in srgb, var(--alert) 35%, transparent)',
}

export const HINT: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }
export const ERROR: React.CSSProperties = { fontSize: '12px', color: 'var(--alert)', lineHeight: 1.5 }
export const WARN: React.CSSProperties  = { fontSize: '12px', color: 'var(--gold-2)', lineHeight: 1.5 }

const STATE_COLOR: Record<OpenHouseDisplayState, { color: string; bg: string }> = {
  draft:     { color: 'var(--text-muted)',    bg: 'var(--bg-elevated)' },
  scheduled: { color: 'var(--gold-2)',   bg: 'color-mix(in srgb, var(--gold-2) 12%, transparent)' },
  cancelled: { color: 'var(--text-muted)',    bg: 'var(--bg-elevated)' },
  finished:  { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
}

const EMAIL_STATUS_COLOR: Record<OpenHouseEmailStatus, { color: string; bg: string }> = {
  pending:   { color: 'var(--gold-3)',   bg: 'color-mix(in srgb, var(--gold-3) 14%, transparent)' },
  sending:   { color: 'var(--gold-2)',   bg: 'color-mix(in srgb, var(--gold-2) 12%, transparent)' },
  sent:      { color: 'var(--gold-1)',  bg: 'color-mix(in srgb, var(--gold-1) 12%, transparent)' },
  cancelled: { color: 'var(--text-muted)',    bg: 'var(--bg-elevated)' },
  failed:    { color: 'var(--alert)',  bg: 'color-mix(in srgb, var(--alert) 12%, transparent)' },
}

const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500,
  padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

export function StateChip({ state }: { state: OpenHouseDisplayState }) {
  const c = STATE_COLOR[state]
  return <span style={{ ...CHIP, color: c.color, background: c.bg }}>{DISPLAY_STATE_LABEL[state]}</span>
}

export function EmailStatusChip({ status }: { status: OpenHouseEmailStatus }) {
  const c = EMAIL_STATUS_COLOR[status]
  return <span style={{ ...CHIP, color: c.color, background: c.bg }}>{EMAIL_STATUS_LABEL[status]}</span>
}

export const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
