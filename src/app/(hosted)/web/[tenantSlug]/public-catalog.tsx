'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { BedDouble, Bath, Maximize, MapPin, SlidersHorizontal, X, ArrowUpRight, Home } from 'lucide-react'
import type { PublicProperty, PublicTenant } from './shared'
import { PROPERTY_TYPE_LABEL, PROPERTY_STATUS_LABEL, formatPrice, bathroomsLabel } from './web-format'

// Catálogo público del tenant — tema claro editorial (misma dirección visual que
// el sitio de referencia): masthead con el logo centrado, barra de filtros
// blanca con pills de estado, y tarjetas blancas con imagen 4:3.

const PRICE_RANGES = [
  { id: 'u250', label: 'Hasta $250k',    min: 0,       max: 250_000 },
  { id: '250_400', label: '$250k – $400k', min: 250_000, max: 400_000 },
  { id: '400_600', label: '$400k – $600k', min: 400_000, max: 600_000 },
  { id: 'o600', label: 'Más de $600k',   min: 600_000, max: Infinity },
] as const

const STATUS_ORDER = ['available', 'in_process', 'sold'] as const

function pal(accent: string) {
  return {
    accent,
    ink: '#12212F',
    paper: '#FBFAF8',
    paperAlt: '#F3F1EC',
    text: '#12212F',
    textSoft: 'rgba(18,33,47,0.66)',
    textFaint: 'rgba(18,33,47,0.5)',
    line: 'rgba(18,33,47,0.10)',
    cardShadow: '0 18px 44px -30px rgba(18,33,47,0.4)',
  }
}
type Pal = ReturnType<typeof pal>

const WRAP: React.CSSProperties = { maxWidth: '1180px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' }
const DISPLAY: React.CSSProperties = { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }

export function PublicCatalog({ tenant, properties }: { tenant: PublicTenant; properties: PublicProperty[] }) {
  const P = pal(tenant.primary_color || '#C9A96E')

  const [status, setStatus]     = useState<string>('all')
  const [city, setCity]         = useState('all')
  const [ptype, setPtype]       = useState('all')
  const [minBeds, setMinBeds]   = useState(0)
  const [price, setPrice]       = useState<string>('all')

  const cities = useMemo(() => [...new Set(properties.map(p => p.city).filter(Boolean))].sort() as string[], [properties])
  const types  = useMemo(() => [...new Set(properties.map(p => p.property_type))], [properties])

  const filtered = useMemo(() => properties.filter(p => {
    if (status !== 'all' && p.status !== status) return false
    if (city !== 'all' && p.city !== city) return false
    if (ptype !== 'all' && p.property_type !== ptype) return false
    if (minBeds > 0 && (p.bedrooms ?? 0) < minBeds) return false
    if (price !== 'all') {
      const r = PRICE_RANGES.find(x => x.id === price)!
      const v = p.list_price ?? 0
      if (v < r.min || v >= r.max) return false
    }
    return true
  }), [properties, status, city, ptype, minBeds, price])

  const hasFilters = status !== 'all' || city !== 'all' || ptype !== 'all' || minBeds > 0 || price !== 'all'
  function clearFilters() { setStatus('all'); setCity('all'); setPtype('all'); setMinBeds(0); setPrice('all') }

  const selectStyle: React.CSSProperties = {
    borderRadius: '10px', border: `1px solid ${P.line}`, background: '#fff',
    padding: '8px 11px', fontSize: '13px', fontWeight: 500, color: P.ink,
    outline: 'none', cursor: 'pointer',
  }

  return (
    <div style={{ background: P.paper, color: P.text, minHeight: '100vh' }}>
      <style>{`
        .pc-card { transition: box-shadow .35s cubic-bezier(0.22,1,0.36,1), transform .35s cubic-bezier(0.22,1,0.36,1); }
        .pc-card:hover { transform: translateY(-4px); box-shadow: 0 26px 56px -30px rgba(18,33,47,0.5); }
        .pc-card:hover .pc-img { transform: scale(1.06); }
        .pc-card:hover .pc-go { opacity: 1; transform: translate(0,0); }
        .pc-img { transition: transform .6s cubic-bezier(0.22,1,0.36,1); }
        .pc-go { opacity: 0; transform: translate(6px,-6px); transition: opacity .25s, transform .25s; }
        .pc-cta:hover { background: ${P.accent} !important; border-color: ${P.accent} !important; color: #12212F !important; }
        .pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
        @media (max-width: 980px) { .pc-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 620px) { .pc-grid { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .pc-card, .pc-img, .pc-go { transition: none !important; } }
      `}</style>

      {/* Masthead — logo centrado */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(251,250,248,0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${P.line}` }}>
        <div style={{ ...WRAP, padding: '15px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Link href={`/web/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
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

      <main style={{ ...WRAP, paddingTop: '48px', paddingBottom: '72px' }}>
        {/* Encabezado editorial */}
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: P.accent, fontWeight: 700, marginBottom: '10px' }}>
            Portafolio
          </div>
          <h1 style={{ ...DISPLAY, fontSize: 'clamp(30px, 5vw, 48px)', margin: 0, color: P.ink }}>Propiedades disponibles</h1>
        </m.div>

        {/* Barra de filtros */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px',
          background: '#fff', border: `1px solid ${P.line}`, borderRadius: '16px',
          padding: '14px 16px', marginBottom: '22px', boxShadow: '0 8px 24px -20px rgba(18,33,47,0.35)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: P.ink }}>
            <SlidersHorizontal size={15} color={P.accent} /> Filtros
          </span>

          {/* Pills de estado */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {(['all', ...STATUS_ORDER] as string[]).map(s => {
              const on = status === s
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    padding: '6px 13px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', borderRadius: '999px', cursor: 'pointer',
                    background: on ? (s === 'all' ? P.ink : P.accent) : 'rgba(18,33,47,0.06)',
                    color: on ? (s === 'all' ? '#fff' : '#12212F') : P.textSoft,
                    border: 'none',
                  }}
                >
                  {s === 'all' ? 'Todas' : PROPERTY_STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: '9px', alignItems: 'center' }}>
            {cities.length > 1 && (
              <select value={city} onChange={e => setCity(e.target.value)} aria-label="Ciudad" style={selectStyle}>
                <option value="all">Todas las ciudades</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {types.length > 1 && (
              <select value={ptype} onChange={e => setPtype(e.target.value)} aria-label="Tipo" style={selectStyle}>
                <option value="all">Todos los tipos</option>
                {types.map(t => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t] ?? t}</option>)}
              </select>
            )}
            <select value={minBeds} onChange={e => setMinBeds(Number(e.target.value))} aria-label="Habitaciones" style={selectStyle}>
              <option value={0}>Habitaciones</option>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}+ hab.</option>)}
            </select>
            <select value={price} onChange={e => setPrice(e.target.value)} aria-label="Inversión" style={selectStyle}>
              <option value="all">Cualquier inversión</option>
              {PRICE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '8px 10px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', color: P.textFaint, cursor: 'pointer' }}>
                <X size={14} /> Limpiar
              </button>
            )}
          </div>
        </div>

        <p style={{ fontSize: '13px', color: P.textFaint, margin: '0 0 22px' }} aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'propiedad' : 'propiedades'}
        </p>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ background: P.paperAlt, borderRadius: '18px', padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: P.textSoft, margin: 0, fontSize: '15px' }}>No hay propiedades con estos filtros.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="pc-cta" style={{ marginTop: '16px', padding: '9px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', background: 'transparent', border: `1px solid ${P.line}`, color: P.ink, cursor: 'pointer' }}>
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="pc-grid">
            {filtered.map((p, i) => (
              <PropertyCard key={p.id} tenantSlug={tenant.slug} property={p} P={P} index={i} />
            ))}
          </div>
        )}

        <p style={{ fontSize: '11px', color: P.textFaint, textAlign: 'center', marginTop: '56px' }}>
          {tenant.name} · Impulsado por ITMANO
        </p>
      </main>
    </div>
  )
}

function PropertyCard({ tenantSlug, property, P, index }: { tenantSlug: string; property: PublicProperty; P: Pal; index: number }) {
  const href = `/web/${tenantSlug}/${property.slug}`
  const statusLabel = PROPERTY_STATUS_LABEL[property.status] ?? property.status
  const location = [property.address, property.city, property.state].filter(Boolean).join(', ')

  return (
    <m.article
      className="pc-card"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(index * 0.06, 0.4) }}
      style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: '#fff', borderRadius: '18px', border: `1px solid ${P.line}`,
        boxShadow: P.cardShadow,
      }}
    >
      {/* Media */}
      <Link href={href} style={{ position: 'relative', display: 'block', aspectRatio: '4 / 3', overflow: 'hidden', background: P.paperAlt }}>
        {property.image_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="pc-img" src={property.image_url} alt={property.name ?? property.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', color: P.textFaint }}>
            <Home size={34} strokeWidth={1.2} />
          </span>
        )}
        <span style={{
          position: 'absolute', left: '14px', top: '14px',
          padding: '5px 12px', borderRadius: '999px',
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
          background: property.status === 'available' ? P.accent : 'rgba(255,255,255,0.94)',
          color: property.status === 'available' ? '#12212F' : P.textSoft,
        }}>
          {statusLabel}
        </span>
        <span className="pc-go" style={{
          position: 'absolute', right: '14px', top: '14px',
          width: '38px', height: '38px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.95)', color: P.ink,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ArrowUpRight size={17} />
        </span>
      </Link>

      {/* Cuerpo */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '20px' }}>
        <div style={{ ...DISPLAY, fontSize: '26px', color: P.ink }}>{formatPrice(property.list_price)}</div>
        <Link href={href} style={{ textDecoration: 'none' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: P.ink, margin: '5px 0 0', letterSpacing: '-0.01em' }}>
            {property.name ?? property.address}
          </h3>
        </Link>
        {location && (
          <p style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '6px', fontSize: '13px', color: P.textSoft, margin: '6px 0 0', lineHeight: 1.45 }}>
            <MapPin size={14} color={P.accent} style={{ flexShrink: 0, marginTop: '2px' }} />
            {location}
          </p>
        )}

        {/* Specs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '16px', paddingTop: '14px', borderTop: `1px solid ${P.line}`, fontSize: '13px', color: P.textSoft }}>
          {property.bedrooms !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><BedDouble size={15} color={P.accent} /> {property.bedrooms} hab.</span>
          )}
          {(property.bathrooms_full !== null || property.bathrooms_half !== null) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Bath size={15} color={P.accent} /> {bathroomsLabel(property.bathrooms_full, property.bathrooms_half)} baños</span>
          )}
          {property.sqft !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Maximize size={15} color={P.accent} /> {property.sqft.toLocaleString('en-US')} ft²</span>
          )}
        </div>

        <Link
          href={href}
          className="pc-cta"
          style={{
            alignSelf: 'flex-start', marginTop: '18px', padding: '9px 18px',
            fontSize: '13px', fontWeight: 700, borderRadius: '10px',
            border: `1px solid ${P.line}`, color: P.ink, textDecoration: 'none',
            transition: 'background .18s, border-color .18s, color .18s',
          }}
        >
          Ver detalles
        </Link>
      </div>
    </m.article>
  )
}
