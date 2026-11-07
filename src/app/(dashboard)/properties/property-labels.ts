import type { PropertyType, PropertyStatus } from '@/lib/data/properties'

// Etiquetas y tono de cada estado de una propiedad. Viven fuera de los módulos
// 'use client' para que los Server Components (el detalle) también los usen.
// Estado con orden: rampa dorada; vendida sale del inventario y va neutra.

export const TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'Residencial',
  condo:       'Condominio',
  townhouse:   'Townhouse',
  land:        'Terreno',
  commercial:  'Comercial',
  multifamily: 'Multifamiliar',
}

export const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponible',        color: 'var(--gold-1)', bg: 'color-mix(in srgb, var(--gold-1) 12%, transparent)' },
  in_process: { label: 'En proceso',       color: 'var(--gold-2)',  bg: 'color-mix(in srgb, var(--gold-2) 12%, transparent)' },
  sold:       { label: 'Vendida',          color: 'var(--text-secondary)', bg: 'var(--bg-overlay)' },
}
