import Link from 'next/link'
import type { PublicTenant } from './shared'

// Cromado compartido de las tres páginas públicas de newsletters — mismo tema
// claro editorial y misma paleta que el catálogo de propiedades
// (web/[tenantSlug]/public-catalog.tsx: pal(), WRAP, masthead con logo
// centrado). Se factoriza en un único archivo porque aquí son tres páginas,
// no dos, y las tres son Server Components sin interactividad: no hace falta
// 'use client' ni duplicar el helper en cada una.

export function pal(accent: string) {
  return {
    accent,
    ink: '#12212F',
    paper: '#FBFAF8',
    paperAlt: '#F3F1EC',
    textSoft: 'rgba(18,33,47,0.66)',
    textFaint: 'rgba(18,33,47,0.5)',
    line: 'rgba(18,33,47,0.10)',
    cardShadow: '0 18px 44px -30px rgba(18,33,47,0.4)',
  }
}
export type Pal = ReturnType<typeof pal>

export const WRAP: React.CSSProperties = { maxWidth: '900px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' }
export const DISPLAY: React.CSSProperties = { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }

export function Masthead({ tenant, P }: { tenant: PublicTenant; P: Pal }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(251,250,248,0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${P.line}` }}>
      <div style={{ ...WRAP, padding: '15px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Link href={`/nl/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          {tenant.logo_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={tenant.logo_url} alt={tenant.name} style={{ height: '36px', width: 'auto', display: 'block' }} />
          ) : (
            <span style={{ width: '36px', height: '36px', borderRadius: '9px', background: `${P.accent}22`, border: `1px solid ${P.accent}66`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 800, color: P.accent }}>
              {tenant.name.trim().slice(0, 1).toUpperCase()}
            </span>
          )}
          <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.01em', color: P.ink }}>{tenant.name}</span>
        </Link>
      </div>
    </header>
  )
}

export function Footer({ tenant, P }: { tenant: PublicTenant; P: Pal }) {
  return (
    <p style={{ fontSize: '11px', color: P.textFaint, textAlign: 'center', marginTop: '56px' }}>
      {tenant.name} · Impulsado por ITMANO
    </p>
  )
}
