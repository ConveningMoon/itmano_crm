import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { PropertyPageOptions } from './property-page-options'
import { PropertyDetailTabs } from './property-detail-tabs'
import { LANGUAGE_CONFIG } from '@/lib/config'

// Detalle de una propiedad (como en fuentes): tab Descripción (todos los datos
// del formulario, con botón Editar que abre el formulario completo) + tab
// Página (catálogo alojado / embebible / solicitar / marca super_admin).

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

  const canEdit = ctx.role !== 'agent' || p.created_by_user_id === ctx.user_id
  const descriptions = (p.descriptions && typeof p.descriptions === 'object') ? p.descriptions as Record<string, string> : {}
  const featuresI18n = (p.features_i18n && typeof p.features_i18n === 'object') ? p.features_i18n as Record<string, string[]> : {}
  const contentLangs = ((p.content_languages as string[] | null) ?? Object.keys(descriptions))
    .filter(l => (descriptions[l]?.trim()) || (featuresI18n[l]?.length))
  const gallery = [(p.image_url as string | null), ...((p.gallery as string[] | null) ?? [])].filter((u): u is string => !!u)

  // ── Tab Descripción: datos completos + botón que abre el formulario de edición ──
  const descripcionTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {canEdit && (
        <div>
          <Link
            href={`/properties?edit=${p.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', textDecoration: 'none',
            }}
          >
            <Pencil size={13} /> Editar propiedad
          </Link>
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
      {(p.mls_number || p.external_url) && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {p.mls_number && <span>MLS #{p.mls_number}</span>}
          {p.external_url && <a href={p.external_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-blue)' }}>Ver listado externo</a>}
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
              {descriptions[l]?.trim() && (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{descriptions[l]}</p>
              )}
              {(featuresI18n[l]?.length ?? 0) > 0 && (
                <ul style={{ margin: '12px 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {featuresI18n[l].map((f, i) => <li key={i}>{f}</li>)}
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
      propertySlug={p.slug ?? null}
      published={!!p.published_to_web}
      managedByItmano={!!p.page_managed_by_itmano}
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

      <PropertyDetailTabs descripcion={descripcionTab} pagina={paginaTab} />
    </>
  )
}
