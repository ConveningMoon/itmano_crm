'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BedDouble, Bath, Maximize, Search, MapPin, SlidersHorizontal } from 'lucide-react'
import type { PublicProperty, PublicTenant } from './shared'
import { PROPERTY_TYPE_LABEL, PROPERTY_STATUS_LABEL, formatPrice, bathroomsLabel } from './web-format'

// Catálogo público de propiedades del tenant. Barra de navegación con el logo
// centrado (para incrustar en la web del cliente), filtros y grid elegante.

const STATUS_ORDER = ['available', 'in_process', 'sold'] as const

export function PublicCatalog({ tenant, properties }: { tenant: PublicTenant; properties: PublicProperty[] }) {
  const accent = tenant.primary_color || '#C9A96E'

  const [query, setQuery]       = useState('')
  const [status, setStatus]     = useState<string>('all')
  const [ptype, setPtype]       = useState<string>('all')
  const [minBeds, setMinBeds]   = useState<number>(0)
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)

  const types = useMemo(
    () => [...new Set(properties.map(p => p.property_type))],
    [properties],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const maxP = maxPrice.trim() ? Number(maxPrice.replace(/[^0-9]/g, '')) : null
    return properties.filter(p => {
      if (status !== 'all' && p.status !== status) return false
      if (ptype !== 'all' && p.property_type !== ptype) return false
      if (minBeds > 0 && (p.bedrooms ?? 0) < minBeds) return false
      if (maxP !== null && p.list_price !== null && p.list_price > maxP) return false
      if (q) {
        const hay = [p.name, p.address, p.neighborhood, p.city, p.state].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [properties, query, status, ptype, minBeds, maxPrice])

  const activeFilters = (status !== 'all' ? 1 : 0) + (ptype !== 'all' ? 1 : 0) + (minBeds > 0 ? 1 : 0) + (maxPrice.trim() ? 1 : 0)

  return (
    <>
      <style>{`
        @keyframes pc-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .pc-card { animation: pc-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s; }
        .pc-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px -24px rgba(0,0,0,0.6); }
        .pc-card:hover .pc-img { transform: scale(1.05); }
        .pc-img { transition: transform 0.6s cubic-bezier(0.22,1,0.36,1); }
        .pc-pill { transition: color 0.15s, background 0.15s, border-color 0.15s; }
        @media (prefers-reduced-motion: reduce) { .pc-card, .pc-img { animation: none !important; transition: none !important; } }
        .pc-input:focus { border-color: ${accent} !important; }
      `}</style>

      {/* Nav — logo centrado tipo masthead */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '18px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Link href={`/web/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            {tenant.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tenant.logo_url} alt={tenant.name} style={{ height: '38px', width: 'auto', display: 'block' }} />
            ) : (
              <span style={{
                width: '38px', height: '38px', borderRadius: '9px',
                background: `${accent}1f`, border: `1px solid ${accent}55`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', fontWeight: 700, color: accent,
              }}>{tenant.name.trim().slice(0, 1).toUpperCase()}</span>
            )}
            <span style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{tenant.name}</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '40px 24px 72px' }}>
        {/* Encabezado editorial */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, fontWeight: 600, marginBottom: '10px' }}>
            Portafolio
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0, color: 'var(--text-primary)' }}>
            Propiedades disponibles
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px' }}>
            {filtered.length} {filtered.length === 1 ? 'propiedad' : 'propiedades'}{filtered.length !== properties.length ? ` de ${properties.length}` : ''}
          </p>
        </div>

        {/* Filtros */}
        <div style={{ marginBottom: '28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Búsqueda */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="pc-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre, zona o ciudad…"
                style={{ width: '100%', padding: '10px 12px 10px 34px', fontSize: '13px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className="pc-pill"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer',
                background: activeFilters > 0 ? `${accent}1a` : 'var(--bg-surface)',
                border: `1px solid ${activeFilters > 0 ? accent : 'var(--border-subtle)'}`,
                borderRadius: '10px', color: activeFilters > 0 ? accent : 'var(--text-secondary)',
              }}
            >
              <SlidersHorizontal size={14} /> Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ''}
            </button>
          </div>

          {/* Chips de estado siempre visibles */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['all', ...STATUS_ORDER] as string[]).map(s => {
              const active = status === s
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className="pc-pill"
                  style={{
                    padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', borderRadius: '999px',
                    background: active ? accent : 'transparent',
                    border: `1px solid ${active ? accent : 'var(--border-subtle)'}`,
                    color: active ? '#0F0F10' : 'var(--text-secondary)',
                  }}
                >
                  {s === 'all' ? 'Todas' : PROPERTY_STATUS_LABEL[s]}
                </button>
              )
            })}
          </div>

          {/* Panel de filtros avanzados */}
          {showFilters && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo</span>
                <select className="pc-input" value={ptype} onChange={e => setPtype(e.target.value)} style={selStyle}>
                  <option value="all">Todos</option>
                  {types.map(t => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t] ?? t}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Habitaciones (mín.)</span>
                <select className="pc-input" value={minBeds} onChange={e => setMinBeds(Number(e.target.value))} style={selStyle}>
                  {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? 'Cualquiera' : `${n}+`}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inversión máx.</span>
                <input className="pc-input" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="$ sin límite" inputMode="numeric" style={selStyle} />
              </label>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  onClick={() => { setStatus('all'); setPtype('all'); setMinBeds(0); setMaxPrice(''); setQuery('') }}
                  style={{ padding: '9px 14px', fontSize: '12px', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Limpiar todo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div style={{ padding: '80px 24px', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
            No hay propiedades que coincidan con tu búsqueda.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '22px' }}>
            {filtered.map((p, i) => (
              <Link
                key={p.id}
                href={`/web/${tenant.slug}/${p.slug ?? p.id}`}
                className="pc-card"
                style={{ display: 'block', textDecoration: 'none', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden', animationDelay: `${Math.min(i * 60, 400)}ms` }}
              >
                <div style={{ position: 'relative', aspectRatio: '3 / 2', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  {p.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img className="pc-img" src={p.image_url} alt={p.name ?? p.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Sin imagen</div>
                  )}
                  <span style={{
                    position: 'absolute', top: '12px', left: '12px',
                    fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '4px 10px', borderRadius: '999px', backdropFilter: 'blur(6px)',
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                  }}>
                    {PROPERTY_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div style={{ padding: '18px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em', color: accent }}>{formatPrice(p.list_price)}</div>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '5px' }}>{p.name ?? p.address}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    <MapPin size={12} /> {[p.neighborhood, p.city, p.state].filter(Boolean).join(', ') || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    {p.bedrooms !== null && <span style={specStyle}><BedDouble size={14} /> {p.bedrooms}</span>}
                    {(p.bathrooms_full !== null || p.bathrooms_half !== null) && <span style={specStyle}><Bath size={14} /> {bathroomsLabel(p.bathrooms_full, p.bathrooms_half)}</span>}
                    {p.sqft !== null && <span style={specStyle}><Maximize size={14} /> {p.sqft.toLocaleString('en-US')} ft²</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '48px', textAlign: 'center' }}>
          {tenant.name} · Impulsado por ITMANO
        </p>
      </main>
    </>
  )
}

const selStyle: React.CSSProperties = {
  padding: '9px 11px', fontSize: '13px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
}
const specStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '5px' }
