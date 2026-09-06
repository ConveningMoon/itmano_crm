'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { m } from 'motion/react'
import { ArrowLeft, BedDouble, Bath, Maximize, Car, Ruler, CalendarDays, ChevronLeft, ChevronRight, X, FileText, MapPin } from 'lucide-react'
import type { PublicProperty, PublicTenant } from '../shared'
import { PROPERTY_STATUS_LABEL, formatPrice, bathroomsLabel } from '../web-format'
import { LANGUAGE_CONFIG } from '@/lib/config'

// Detalle público de una propiedad — tema claro editorial (misma dirección que
// el catálogo). Galería en mosaico (portada 2×2 + "+N más") con lightbox, y
// sección aparte de planos.

function pickDefaultLang(langs: string[]): string {
  if (langs.includes('es')) return 'es'
  if (langs.includes('en')) return 'en'
  return langs[0] ?? 'en'
}

function pal(accent: string) {
  return {
    accent,
    ink: '#12212F',
    paper: '#FBFAF8',
    paperAlt: '#F3F1EC',
    textSoft: 'rgba(18,33,47,0.68)',
    textFaint: 'rgba(18,33,47,0.5)',
    line: 'rgba(18,33,47,0.10)',
  }
}
type Pal = ReturnType<typeof pal>

const WRAP: React.CSSProperties = { maxWidth: '1080px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' }
const DISPLAY: React.CSSProperties = { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.05 }

export function PublicPropertyView({
  tenant, property,
}: {
  tenant: PublicTenant
  property: PublicProperty
}) {
  const P = pal(tenant.primary_color || '#C9A96E')

  const photos = [property.image_url, ...(property.gallery ?? [])]
    .filter((u): u is string => !!u)
    .filter((u, i, arr) => arr.indexOf(u) === i)
  const floorPlans = (property.floor_plans ?? []).filter(Boolean)

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
    property.bedrooms      !== null ? { icon: <BedDouble size={18} />, label: 'Habitaciones', value: String(property.bedrooms) } : null,
    (property.bathrooms_full !== null || property.bathrooms_half !== null) ? { icon: <Bath size={18} />, label: 'Baños', value: bathroomsLabel(property.bathrooms_full, property.bathrooms_half) } : null,
    property.garage_spaces !== null ? { icon: <Car size={18} />, label: 'Garaje', value: String(property.garage_spaces) } : null,
    property.sqft          !== null ? { icon: <Maximize size={18} />, label: 'Superficie', value: `${property.sqft.toLocaleString('en-US')} ft²` } : null,
    property.lot_sqft      !== null ? { icon: <Ruler size={18} />, label: 'Terreno', value: `${property.lot_sqft.toLocaleString('en-US')} ft²` } : null,
    property.year_built    !== null ? { icon: <CalendarDays size={18} />, label: 'Año', value: String(property.year_built) } : null,
  ] as (Spec | null)[]).filter((s): s is Spec => s !== null)

  const location = [property.address, property.neighborhood, property.city, property.state].filter(Boolean).join(', ')

  return (
    <div style={{ background: P.paper, color: P.ink, minHeight: '100vh' }}>
      <style>{`
        @keyframes ppv-fade { from { opacity: 0 } to { opacity: 1 } }
        .ppv-thumb { cursor: zoom-in; transition: opacity .2s, transform .5s cubic-bezier(0.22,1,0.36,1); }
        .ppv-thumb:hover { opacity: .92; }
        .ppv-hero { cursor: zoom-in; transition: transform .6s cubic-bezier(0.22,1,0.36,1); }
        .ppv-tile:hover .ppv-hero, .ppv-tile:hover .ppv-thumb { transform: scale(1.04); }
        .ppv-box { animation: ppv-fade .2s ease both; }
        .ppv-navbtn { transition: background .15s; }
        .ppv-navbtn:hover { background: rgba(255,255,255,0.22) !important; }
        .ppv-pdf:hover { filter: brightness(1.06); }
        @media (prefers-reduced-motion: reduce) { .ppv-box, .ppv-hero, .ppv-thumb { animation: none !important; transition: none !important; } }
      `}</style>

      {/* Masthead — logo centrado */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(251,250,248,0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${P.line}` }}>
        <div style={{ ...WRAP, padding: '15px 24px', display: 'flex', justifyContent: 'center' }}>
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

      <main style={{ ...WRAP, paddingTop: '26px', paddingBottom: '72px' }}>
        <Link href={`/web/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: P.textFaint, textDecoration: 'none', marginBottom: '20px' }}>
          <ArrowLeft size={14} /> Volver al portafolio
        </Link>

        {/* Galería */}
        {photos.length === 1 && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            className="ppv-hero"
            src={photos[0]}
            alt={property.name ?? property.address}
            onClick={() => setBox({ list: photos, i: 0 })}
            style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '18px', display: 'block', marginBottom: '30px' }}
          />
        )}
        {photos.length >= 2 && (() => {
          const shown  = photos.slice(0, 13)
          const thumbs = shown.slice(1)
          const extra  = photos.length - shown.length
          const rows   = thumbs.length <= 4 ? 2 : thumbs.length <= 8 ? 3 : 4
          return (
            <div style={{
              display: 'grid', gap: '8px', marginBottom: '30px',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              aspectRatio: `4 / ${rows}`,
            }}>
              <div className="ppv-tile" style={{ gridColumn: '1 / span 2', gridRow: '1 / span 2', overflow: 'hidden', borderRadius: '16px', background: P.paperAlt }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="ppv-hero"
                  src={photos[0]}
                  alt={property.name ?? property.address}
                  onClick={() => setBox({ list: photos, i: 0 })}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              {thumbs.map((url, idx) => {
                const overlay = idx === thumbs.length - 1 && extra > 0
                return (
                  <div key={url} className="ppv-tile" style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: P.paperAlt }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="ppv-thumb"
                      src={url}
                      alt=""
                      onClick={() => setBox({ list: photos, i: idx + 1 })}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {overlay && (
                      <div
                        onClick={() => setBox({ list: photos, i: idx + 1 })}
                        style={{
                          position: 'absolute', inset: 0, cursor: 'zoom-in',
                          background: 'rgba(18,33,47,0.62)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 'clamp(15px, 2.2vw, 22px)', fontWeight: 700,
                        }}
                      >
                        +{extra} más
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Encabezado */}
        <m.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}
        >
          <div>
            <div style={{ ...DISPLAY, fontSize: 'clamp(30px, 5vw, 44px)', color: P.ink }}>{formatPrice(property.list_price)}</div>
            <h1 style={{ fontSize: 'clamp(19px, 3vw, 26px)', fontWeight: 700, letterSpacing: '-0.01em', margin: '8px 0 0', color: P.ink }}>
              {property.name ?? property.address}
            </h1>
            {location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '14px', color: P.textSoft, marginTop: '7px' }}>
                <MapPin size={15} color={P.accent} /> {location}
              </div>
            )}
          </div>
          <span style={{
            fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            padding: '6px 14px', borderRadius: '999px',
            background: property.status === 'available' ? P.accent : P.paperAlt,
            color: property.status === 'available' ? '#12212F' : P.textSoft,
          }}>
            {PROPERTY_STATUS_LABEL[property.status] ?? property.status}
          </span>
        </m.div>

        {/* Specs */}
        {specs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginTop: '28px' }}>
            {specs.map((s, i) => (
              <m.div
                key={s.label}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                style={{ background: '#fff', border: `1px solid ${P.line}`, borderRadius: '14px', padding: '16px' }}
              >
                <div style={{ color: P.accent, marginBottom: '9px' }}>{s.icon}</div>
                <div style={{ fontSize: '19px', fontWeight: 800, color: P.ink, letterSpacing: '-0.01em' }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: P.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '3px' }}>{s.label}</div>
              </m.div>
            ))}
          </div>
        )}

        {/* Selector de idioma */}
        {contentLangs.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '36px', flexWrap: 'wrap' }}>
            {contentLangs.map(l => {
              const on = l === lang
              return (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    padding: '6px 13px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '999px',
                    background: on ? P.accent : 'transparent',
                    border: `1px solid ${on ? P.accent : P.line}`,
                    color: on ? '#12212F' : P.textSoft,
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
          <section style={{ marginTop: contentLangs.length > 1 ? '22px' : '44px' }}>
            <SectionTitle P={P}>Sobre la propiedad</SectionTitle>
            <p style={{ fontSize: '15.5px', color: P.textSoft, lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0 }}>{description}</p>
          </section>
        )}

        {/* Características */}
        {features.length > 0 && (
          <section style={{ marginTop: '44px' }}>
            <SectionTitle P={P}>Características</SectionTitle>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
              {features.map((f, i) => (
                <li key={i} style={{ display: 'flex', gap: '9px', fontSize: '14px', color: P.textSoft }}>
                  <span aria-hidden style={{ color: P.accent, fontWeight: 800, flexShrink: 0 }}>—</span>{f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Planos */}
        {floorPlans.length > 0 && (
          <section style={{ marginTop: '44px' }}>
            <SectionTitle P={P}>Planos</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {floorPlans.map((url, idx) => (
                <div key={url} className="ppv-tile" style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${P.line}`, background: '#fff' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="ppv-thumb"
                    src={url}
                    alt={`Plano ${idx + 1}`}
                    onClick={() => setBox({ list: floorPlans, i: idx })}
                    style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {property.detail_pdf_url && (
          <a href={property.detail_pdf_url} target="_blank" rel="noopener noreferrer" className="ppv-pdf" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '40px', padding: '13px 24px', fontSize: '14px', fontWeight: 700, background: P.accent, color: '#12212F', borderRadius: '11px', textDecoration: 'none' }}>
            <FileText size={16} /> Descargar ficha completa
          </a>
        )}

        <p style={{ fontSize: '11px', color: P.textFaint, marginTop: '56px', textAlign: 'center' }}>
          {tenant.name} · Impulsado por ITMANO
        </p>
      </main>

      {/* Lightbox */}
      {box && (
        <div
          className="ppv-box"
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(12,20,28,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
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
            style={{ maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: '10px', display: 'block' }}
          />
          {box.list.length > 1 && (
            <div style={{ position: 'absolute', bottom: '22px', left: '50%', transform: 'translateX(-50%)', fontSize: '13px', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.04em' }}>
              {box.i + 1} / {box.list.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ children, P }: { children: React.ReactNode; P: Pal }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ width: '30px', height: '2px', background: P.accent, marginBottom: '11px', borderRadius: '2px' }} />
      <h2 style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: P.textFaint, margin: 0 }}>{children}</h2>
    </div>
  )
}

function lightboxBtn(pos: 'left' | 'right' | 'top-right'): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '44px', height: '44px', borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: 'rgba(255,255,255,0.12)', color: '#fff',
  }
  if (pos === 'left')  return { ...base, left: '18px', top: '50%', transform: 'translateY(-50%)' }
  if (pos === 'right') return { ...base, right: '18px', top: '50%', transform: 'translateY(-50%)' }
  return { ...base, top: '18px', right: '18px' }
}
