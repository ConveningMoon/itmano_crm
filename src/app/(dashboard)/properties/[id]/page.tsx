import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { PropertyPageOptions } from './property-page-options'

// Detalle de una propiedad (como en fuentes): los datos que ya se ven en la
// tarjeta + las opciones de página (catálogo alojado / embebible / solicitar
// a ITMANO / marca de conectada por ITMANO para super_admin).

const TYPE_LABEL: Record<string, string> = {
  residential: 'Residencial', condo: 'Condominio', townhouse: 'Townhouse',
  land: 'Terreno', commercial: 'Comercial', multifamily: 'Multifamiliar',
}
const STATUS_LABEL: Record<string, string> = {
  available: 'Disponible', in_process: 'En proceso', sold: 'Vendida',
}

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireTenantContext()
  const db  = createAdminClient()

  let q = db.from('properties').select('*').eq('id', id)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)
  const { data: row } = await q.maybeSingle()
  if (!row) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = row as any

  const { data: tenantRow } = await db.from('tenants').select('slug').eq('id', p.tenant_id).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''

  const price = p.list_price !== null && p.list_price !== undefined
    ? `$${Number(p.list_price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—'

  const facts: { label: string; value: string }[] = [
    { label: 'Tipo', value: TYPE_LABEL[p.property_type] ?? p.property_type },
    { label: 'Inversión', value: price },
    { label: 'Habitaciones', value: p.bedrooms !== null ? String(p.bedrooms) : '—' },
    { label: 'Baños', value: p.bathrooms !== null ? String(p.bathrooms) : '—' },
    { label: 'Superficie', value: p.sqft !== null ? `${Number(p.sqft).toLocaleString('en-US')} ft²` : '—' },
    { label: 'Año', value: p.year_built !== null ? String(p.year_built) : '—' },
  ]

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/properties" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Propiedades
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {p.image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.image_url} alt={p.address} style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-subtle)' }} />
        )}
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              {p.name ?? p.address}
            </h1>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: p.status === 'available' ? 'var(--accent-green)' : p.status === 'sold' ? 'var(--text-muted)' : 'var(--accent-gold)',
              background: 'var(--bg-elevated)',
            }}>
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: p.published_to_web ? 'var(--accent-teal)' : 'var(--text-muted)',
              background: p.published_to_web ? 'rgba(90,175,160,0.12)' : 'var(--bg-elevated)',
            }}>
              {p.published_to_web ? 'Publicada en web' : 'Sin publicar'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {[p.address, p.neighborhood, p.city, p.state].filter(Boolean).join(', ')}
          </div>
        </div>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4" style={{ marginBottom: '28px' }}>
        {facts.map(f => (
          <div key={f.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{f.label}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* Opciones de página */}
      <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        Página de la propiedad
      </h2>
      {tenantSlug ? (
        <PropertyPageOptions
          propertyId={p.id}
          propertyName={p.name ?? p.address}
          tenantSlug={tenantSlug}
          propertySlug={p.slug ?? null}
          published={!!p.published_to_web}
          managedByItmano={!!p.page_managed_by_itmano}
          isSuperAdmin={ctx.role === 'super_admin'}
        />
      ) : (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>El tenant no tiene slug configurado.</div>
      )}
    </>
  )
}
