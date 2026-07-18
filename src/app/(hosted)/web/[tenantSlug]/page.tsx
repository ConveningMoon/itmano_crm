import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicTenant, getPublishedProperties, formatPrice, bathroomsLabel } from './shared'

// Catálogo público de propiedades del tenant — properties.itmano.com/<slug>.
// Muestra solo filas published_to_web con las columnas públicas.

type Params = Promise<{ tenantSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  return {
    title: `Propiedades — ${tenant.name}`,
    description: `Propiedades disponibles de ${tenant.name}.`,
  }
}

export default async function PublicPropertiesPage({ params }: { params: Params }) {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()

  const properties = await getPublishedProperties(tenant.id)
  const accent = tenant.primary_color || '#C9A96E'

  return (
    <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '40px 20px 64px' }}>
      <style>{`.prop-card { transition: border-color 0.15s, transform 0.15s; } .prop-card:hover { border-color: ${accent}66 !important; transform: translateY(-2px); }`}</style>

      {/* Marca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        {tenant.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={tenant.logo_url} alt={tenant.name} style={{ height: '40px', width: 'auto', display: 'block' }} />
        ) : (
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: `${accent}22`, border: `1px solid ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: 700, color: accent,
          }}>
            {tenant.name.trim().slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>{tenant.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Propiedades disponibles</div>
        </div>
      </div>

      {properties.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.12)',
          borderRadius: '12px', padding: '64px 24px', textAlign: 'center',
          fontSize: '14px', color: 'var(--text-muted)',
        }}>
          No hay propiedades publicadas en este momento.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {properties.map(p => (
            <Link
              key={p.id}
              href={`/web/${tenant.slug}/${p.slug ?? p.id}`}
              className="prop-card"
              style={{
                display: 'block', textDecoration: 'none',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '12px', overflow: 'hidden',
              }}
            >
              <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                {p.image_url && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.image_url} alt={p.name ?? p.address} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
              </div>
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: accent }}>{formatPrice(p.list_price)}</div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {p.name ?? p.address}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {[p.neighborhood, p.city, p.state].filter(Boolean).join(', ')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {p.bedrooms !== null && <span>{p.bedrooms} hab.</span>}
                  {(p.bathrooms_full !== null || p.bathrooms_half !== null) && (
                    <span>{bathroomsLabel(p.bathrooms_full, p.bathrooms_half)} baños</span>
                  )}
                  {p.sqft !== null && <span>{p.sqft.toLocaleString('en-US')} ft²</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '40px', textAlign: 'center' }}>
        {tenant.name} · Impulsado por ITMANO
      </p>
    </main>
  )
}
