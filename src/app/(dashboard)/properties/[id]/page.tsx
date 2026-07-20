import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getPropertyById } from '@/lib/data/properties'
import { PropertyPageOptions } from './property-page-options'
import { PropertyDetailTabs } from './property-detail-tabs'
import { EditPropertyButton } from './edit-property-button'
import { LANGUAGE_CONFIG } from '@/lib/config'

// Detalle de una propiedad (como en fuentes): tab Descripción (todos los datos
// del formulario, con botón Editar que abre el formulario completo COMO MODAL
// en esta misma página) + tab Página (catálogo alojado / embebible / solicitar).

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

  const p = await getPropertyById(id, ctx.tenant_id)
  if (!p) notFound()

  const db = createAdminClient()
  const { data: tenantRow } = await db.from('tenants').select('slug').eq('id', p.tenantId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''

  const price = p.listPrice !== null
    ? `$${p.listPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—'

  const facts: { label: string; value: string }[] = [
    { label: 'Tipo', value: TYPE_LABEL[p.propertyType] ?? p.propertyType },
    { label: 'Inversión', value: price },
    { label: 'Habitaciones', value: p.bedrooms !== null ? String(p.bedrooms) : '—' },
    { label: 'Baños', value: p.bathrooms !== null ? String(p.bathrooms) : '—' },
    { label: 'Superficie', value: p.sqft !== null ? `${p.sqft.toLocaleString('en-US')} ft²` : '—' },
    { label: 'Año', value: p.yearBuilt !== null ? String(p.yearBuilt) : '—' },
  ]

  const canEdit = ctx.role !== 'agent' || p.createdByUserId === ctx.user_id
  const contentLangs = (p.contentLanguages.length ? p.contentLanguages : Object.keys(p.descriptions))
    .filter(l => (p.descriptions[l]?.trim()) || (p.featuresI18n[l]?.length))
  const gallery = [p.imageUrl, ...p.gallery].filter((u): u is string => !!u)

  // ── Tab Descripción: datos completos + botón que abre el modal de edición ──
  const descripcionTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {canEdit && (
        <div>
          <EditPropertyButton property={p} allowDelete={canEdit} />
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Abre el formulario completo (datos, descripciones, características, fotos, PDF y publicación).
          </p>
        </div>
      )}

      {/* Facts */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {facts.map(f => (
          <div key={f.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{f.label}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* MLS / enlace externo */}
      {(p.mlsNumber || p.externalUrl) && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {p.mlsNumber && <span>MLS #{p.mlsNumber}</span>}
          {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>Ver listado externo</a>}
        </div>
      )}

      {/* Descripciones y características por idioma */}
      {contentLangs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {contentLangs.map(l => (
            <div key={l} style={{ border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l.toUpperCase()}
              </div>
              {p.descriptions[l]?.trim() && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{p.descriptions[l]}</p>
              )}
              {(p.featuresI18n[l]?.length ?? 0) > 0 && (
                <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {p.featuresI18n[l].map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Galería */}
      {gallery.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Fotos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
            {gallery.map(url => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={url} src={url} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} />
            ))}
          </div>
        </div>
      )}

      {p.notes && (
        <div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Notas internas</div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{p.notes}</p>
        </div>
      )}
    </div>
  )

  const paginaTab = tenantSlug ? (
    <PropertyPageOptions
      propertyId={p.id}
      propertyName={p.name ?? p.address}
      tenantSlug={tenantSlug}
      propertySlug={p.slug}
      published={p.publishedToWeb}
      managedByItmano={p.pageManagedByItmano}
      isSuperAdmin={ctx.role === 'super_admin'}
    />
  ) : (
    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>El tenant no tiene slug configurado.</div>
  )

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <Link href="/properties" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Propiedades
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {p.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.imageUrl} alt={p.address} style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border-subtle)' }} />
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
              color: p.publishedToWeb ? 'var(--accent-teal)' : 'var(--text-muted)',
              background: p.publishedToWeb ? 'rgba(90,175,160,0.12)' : 'var(--bg-elevated)',
            }}>
              {p.publishedToWeb ? 'Publicada en web' : 'Sin publicar'}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {[p.address, p.neighborhood, p.city, p.state].filter(Boolean).join(', ')}
          </div>
        </div>
      </div>

      <PropertyDetailTabs descripcion={descripcionTab} pagina={paginaTab} />
    </>
  )
}
