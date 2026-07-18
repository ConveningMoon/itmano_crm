'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BedDouble, Bath, Maximize, Car, Ruler, CalendarDays, ChevronLeft, ChevronRight, X, FileText, MapPin } from 'lucide-react'
import type { PublicProperty, PublicTenant } from '../shared'
import { PROPERTY_STATUS_LABEL, formatPrice, bathroomsLabel } from '../web-format'
import { LANGUAGE_CONFIG } from '@/lib/config'

// Prioridad de idioma para mostrar por defecto en la web pública.
function pickDefaultLang(langs: string[]): string {
  if (langs.includes('es')) return 'es'
  if (langs.includes('en')) return 'en'
  return langs[0] ?? 'en'
}

// Detalle público de una propiedad, con galería tipo lightbox (abrir foto por
// foto, teclado + flechas) y sección aparte de planos.

export function PublicPropertyView({
  tenant, property,
}: {
  tenant: PublicTenant
  property: PublicProperty
}) {
  const accent = tenant.primary_color || '#C9A96E'

  const photos = [property.image_url, ...(property.gallery ?? [])]
    .filter((u): u is string => !!u)
    .filter((u, i, arr) => arr.indexOf(u) === i)
  const floorPlans = (property.floor_plans ?? []).filter(Boolean)

  // Lightbox: lista activa (fotos o planos) + índice.
  const [box, setBox] = useState<{ list: string[]; i: number } | null>(null)

  const close = useCallback(() => setBox(null), [])
  const move = useCallback((delta: number) => {
    setBox(prev => prev ? { ...prev, i: (prev.i + delta + prev.list.length) % prev.list.length } : prev)
  }, [])

  useEffect(() => {
    if (!box) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [box, close, move])

  // Idiomas disponibles del contenido (i18n) con fallback a los mirror es/en.
  const descriptions = property.descriptions ?? {}
  const featuresMap  = property.features_i18n ?? {}
  const contentLangs = (property.content_languages && property.content_languages.length
    ? property.content_languages
    : Object.keys(descriptions)
  ).filter(l => descriptions[l] || (featuresMap[l]?.length))

  const [lang, setLang] = useState(() => pickDefaultLang(contentLangs))

  const description = descriptions[lang] ?? property.description_es ?? property.description_en
  const features = (featuresMap[lang]?.length ? featuresMap[lang] : (property.features_es?.length ? property.features_es : property.features_en)) ?? []

  type Spec = { icon: React.ReactNode; label: string; value: string }
  const specs: Spec[] = ([
    property.bedrooms      !== null ? { icon: <BedDouble size={17} />, label: 'Habitaciones', value: String(property.bedrooms) } : null,
    (property.bathrooms_full !== null || property.bathrooms_half !== null) ? { icon: <Bath size={17} />, label: 'Baños', value: bathroomsLabel(property.bathrooms_full, property.bathrooms_half) } : null,
    property.garage_spaces !== null ? { icon: <Car size={17} />, label: 'Garaje', value: String(property.garage_spaces) } : null,
    property.sqft          !== null ? { icon: <Maximize size={17} />, label: 'Superficie', value: `${property.sqft.toLocaleString('en-US')} ft²` } : null,
    property.lot_sqft      !== null ? { icon: <Ruler size={17} />, label: 'Terreno', value: `${property.lot_sqft.toLocaleString('en-US')} ft²` } : null,
    property.year_built    !== null ? { icon: <CalendarDays size={17} />, label: 'Año', value: String(property.year_built) } : null,
  ] as (Spec | null)[]).filter((s): s is Spec => s !== null)

  return (
    <>
      <style>{`
        @keyframes ppv-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ppv-rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
        .ppv-thumb { transition: opacity 0.2s, transform 0.3s; cursor: zoom-in; }
        .ppv-thumb:hover { opacity: 0.85; }
        .ppv-hero { cursor: zoom-in; transition: filter 0.3s; }
        .ppv-hero:hover { filter: brightness(1.03); }
        .ppv-box { animation: ppv-fade 0.2s ease both; }
        .ppv-rise { animation: ppv-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .ppv-navbtn { transition: background 0.15s; }
        .ppv-navbtn:hover { background: rgba(255,255,255,0.16) !important; }
        @media (prefers-reduced-motion: reduce) { .ppv-box, .ppv-rise { animation: none !important; } }
      `}</style>

      {/* Nav con logo centrado */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '18px 24px', display: 'flex', justifyContent: 'center' }}>
          <Link href={`/web/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            {tenant.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tenant.logo_url} alt={tenant.name} style={{ height: '38px', width: 'auto', display: 'block' }} />
            ) : (
              <span style={{ width: '38px', height: '38px', borderRadius: '9px', background: `${accent}1f`, border: `1px solid ${accent}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: accent }}>{tenant.name.trim().slice(0, 1).toUpperCase()}</span>
            )}
            <span style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{tenant.name}</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '28px 24px 72px' }}>
        <Link href={`/web/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '22px' }}>
          <ArrowLeft size={14} /> Volver al portafolio
        </Link>

        {/* Galería */}
        {photos.length > 0 && (
          <div className="ppv-rise" style={{ display: 'grid', gap: '10px', marginBottom: '32px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="ppv-hero"
              src={photos[0]}
              alt={property.name ?? property.address}
              onClick={() => setBox({ list: photos, i: 0 })}
              style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '16px', display: 'block' }}
            />
            {photos.length > 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                {photos.slice(1).map((url, idx) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={url}
                    className="ppv-thumb"
                    src={url}
                    alt=""
                    onClick={() => setBox({ list: photos, i: idx + 1 })}
                    style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '10px', display: 'block' }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Encabezado */}
        <div className="ppv-rise" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '-0.02em', color: accent }}>{formatPrice(property.list_price)}</div>
            <h1 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 600, letterSpacing: '-0.01em', margin: '6px 0 0', color: 'var(--text-primary)' }}>
              {property.name ?? property.address}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'var(--text-muted)', marginTop: '6px' }}>
              <MapPin size={14} /> {[property.address, property.neighborhood, property.city, property.state].filter(Boolean).join(', ')}
            </div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: '999px', color: accent, background: `${accent}18`, border: `1px solid ${accent}44` }}>
            {PROPERTY_STATUS_LABEL[property.status] ?? property.status}
          </span>
        </div>

        {/* Specs */}
        {specs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginTop: '24px' }}>
            {specs.map(s => (
              <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ color: accent, marginBottom: '8px' }}>{s.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Selector de idioma del contenido */}
        {contentLangs.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '36px', flexWrap: 'wrap' }}>
            {contentLangs.map(l => {
              const on = l === lang
              return (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', borderRadius: '999px',
                    background: on ? `${accent}1a` : 'transparent',
                    border: `1px solid ${on ? accent : 'var(--border-subtle)'}`,
                    color: on ? accent : 'var(--text-muted)',
                  }}
                >
                  {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.flag} {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l.toUpperCase()}
                </button>
              )
            })}
          </div>
        )}

        {/* Descripción */}
        {description && (
          <section style={{ marginTop: contentLangs.length > 1 ? '20px' : '40px' }}>
            <SectionTitle accent={accent}>Sobre la propiedad</SectionTitle>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>{description}</p>
          </section>
        )}

        {/* Características */}
        {features.length > 0 && (
          <section style={{ marginTop: '40px' }}>
            <SectionTitle accent={accent}>Características</SectionTitle>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: '9px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span aria-hidden style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>—</span>{f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Planos */}
        {floorPlans.length > 0 && (
          <section style={{ marginTop: '40px' }}>
            <SectionTitle accent={accent}>Planos</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {floorPlans.map((url, idx) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={url}
                  className="ppv-thumb"
                  src={url}
                  alt={`Plano ${idx + 1}`}
                  onClick={() => setBox({ list: floorPlans, i: idx })}
                  style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '12px', display: 'block', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
                />
              ))}
            </div>
          </section>
        )}

        {property.detail_pdf_url && (
          <a href={property.detail_pdf_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '36px', padding: '12px 22px', fontSize: '14px', fontWeight: 600, background: accent, color: '#0F0F10', borderRadius: '10px', textDecoration: 'none' }}>
            <FileText size={16} /> Descargar ficha completa
          </a>
        )}

        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '56px', textAlign: 'center' }}>
          {tenant.name} · Impulsado por ITMANO
        </p>
      </main>

      {/* Lightbox */}
      {box && (
        <div
          className="ppv-box"
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(8,8,10,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <button onClick={close} aria-label="Cerrar" className="ppv-navbtn" style={lightboxBtn('top-right')}><X size={20} /></button>
          {box.list.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); move(-1) }} aria-label="Anterior" className="ppv-navbtn" style={lightboxBtn('left')}><ChevronLeft size={26} /></button>
              <button onClick={e => { e.stopPropagation(); move(1) }} aria-label="Siguiente" className="ppv-navbtn" style={lightboxBtn('right')}><ChevronRight size={26} /></button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={box.list[box.i]}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
          />
          {box.list.length > 1 && (
            <div style={{ position: 'absolute', bottom: '22px', left: '50%', transform: 'translateX(-50%)', fontSize: '13px', color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
              {box.i + 1} / {box.list.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function SectionTitle({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ width: '32px', height: '2px', background: accent, marginBottom: '10px', borderRadius: '2px' }} />
      <h2 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>{children}</h2>
    </div>
  )
}

function lightboxBtn(pos: 'left' | 'right' | 'top-right'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '44px', height: '44px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.08)', color: '#fff',
  }
  if (pos === 'left')  return { ...base, left: '18px', top: '50%', transform: 'translateY(-50%)' }
  if (pos === 'right') return { ...base, right: '18px', top: '50%', transform: 'translateY(-50%)' }
  return { ...base, top: '18px', right: '18px' }
}
