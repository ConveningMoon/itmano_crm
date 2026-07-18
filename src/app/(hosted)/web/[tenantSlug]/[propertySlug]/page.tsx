import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicTenant, getPublishedProperty, formatPrice, bathroomsLabel } from '../shared'

// Detalle público de una propiedad publicada — properties.itmano.com/<t>/<slug>.

type Params = Promise<{ tenantSlug: string; propertySlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, propertySlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  const property = await getPublishedProperty(tenant.id, propertySlug)
  if (!property) return { title: 'Propiedad no disponible' }
  return {
    title: `${property.name ?? property.address} — ${tenant.name}`,
    description: (property.description_es ?? property.description_en ?? '').slice(0, 160) || undefined,
  }
}

export default async function PublicPropertyDetailPage({ params }: { params: Params }) {
  const { tenantSlug, propertySlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()
  const property = await getPublishedProperty(tenant.id, propertySlug)
  if (!property) notFound()

  const accent      = tenant.primary_color || '#C9A96E'
  const description = property.description_es ?? property.description_en
  const features    = (property.features_es?.length ? property.features_es : property.features_en) ?? []
  const gallery     = [property.image_url, ...(property.gallery ?? [])]
    .filter((u): u is string => !!u)
    .filter((u, i, arr) => arr.indexOf(u) === i)

  const specs: { label: string; value: string }[] = [
    property.bedrooms      !== null ? { label: 'Habitaciones', value: String(property.bedrooms) } : null,
    (property.bathrooms_full !== null || property.bathrooms_half !== null)
      ? { label: 'Baños', value: bathroomsLabel(property.bathrooms_full, property.bathrooms_half) } : null,
    property.garage_spaces !== null ? { label: 'Garaje', value: `${property.garage_spaces} auto${property.garage_spaces === 1 ? '' : 's'}` } : null,
    property.sqft          !== null ? { label: 'Superficie', value: `${property.sqft.toLocaleString('en-US')} ft²` } : null,
    property.lot_sqft      !== null ? { label: 'Terreno', value: `${property.lot_sqft.toLocaleString('en-US')} ft²` } : null,
    property.year_built    !== null ? { label: 'Año', value: String(property.year_built) } : null,
  ].filter((s): s is { label: string; value: string } => s !== null)

  return (
    <main style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px 64px' }}>
      {/* Volver */}
      <Link
        href={`/web/${tenant.slug}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '20px' }}
      >
        ← {tenant.name} · Propiedades
      </Link>

      {/* Galería */}
      {gallery.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '28px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gallery[0]} alt={property.name ?? property.address} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '12px', display: 'block' }} />
          {gallery.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
              {gallery.slice(1, 7).map(url => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={url} src={url} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '8px', display: 'block' }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Encabezado */}
      <div style={{ fontSize: '24px', fontWeight: 700, color: accent }}>{formatPrice(property.list_price)}</div>
      <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 600, margin: '6px 0 0', color: 'var(--text-primary)' }}>
        {property.name ?? property.address}
      </h1>
      <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
        {[property.address, property.neighborhood, property.city, property.state].filter(Boolean).join(', ')}
      </div>

      {/* Specs */}
      {specs.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '20px' }}>
          {specs.map(s => (
            <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '10px 16px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Descripción */}
      {description && (
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, marginTop: '28px', whiteSpace: 'pre-wrap' }}>
          {description}
        </p>
      )}

      {/* Features */}
      {features.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
          {features.map(f => (
            <li key={f} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span aria-hidden style={{ color: accent }}>✓</span>{f}
            </li>
          ))}
        </ul>
      )}

      {property.detail_pdf_url && (
        <a
          href={property.detail_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', marginTop: '28px', padding: '11px 20px',
            fontSize: '13px', fontWeight: 600, background: accent, color: '#0F0F10',
            borderRadius: '8px', textDecoration: 'none',
          }}
        >
          Descargar ficha (PDF)
        </a>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '48px', textAlign: 'center' }}>
        {tenant.name} · Impulsado por ITMANO
      </p>
    </main>
  )
}
