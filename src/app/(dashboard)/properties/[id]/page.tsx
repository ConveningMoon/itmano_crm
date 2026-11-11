import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTenantRow } from '@/lib/data/tenants'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getPropertyById } from '@/lib/data/properties'
import { PropertyPageOptions } from './property-page-options'
import { PropertyDetailTabs } from './property-detail-tabs'
import { EditPropertyButton } from './edit-property-button'
import { LANGUAGE_CONFIG } from '@/lib/config'
import { lastOpenHouseTimezone, listPropertyOpenHouses, listSenderAgents, listTenantTags } from '@/lib/data/open-houses'
import { resolveOpenHouseSender } from '@/lib/services/open-house-sender'
import { DEFAULT_AUDIENCE_TAG_SLUGS } from '@/lib/open-houses/model'
import { OpenHouseTab } from './open-houses/open-house-tab'
import { mapBusinessProfile } from '@/lib/data/business-profile'
import { businessTimeZone } from '@/lib/time-zones'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { STATUS_CONFIG, TYPE_LABELS } from '../property-labels'
import { PropertyDetailSkeleton } from './property-detail-skeleton'

// Detalle de una propiedad (como en fuentes): botón Editar en la cabecera, que
// abre el formulario completo COMO MODAL en esta misma página; tab Descripción
// (textos, fotos y ficha) + tab Página (catálogo alojado / embebible / solicitar)
// + tab Open house (open-houses/).

async function PropertyContent({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id } = await params
  const { tab } = await searchParams
  const ctx = await requireTenantContext()

  // La propiedad y la fila del tenant van juntas: requireTenantContext ya
  // garantiza el tenant, y una propiedad de otro tenant no resuelve (404), así
  // que leer el tenant del contexto en paralelo no espera nada ni filtra de más.
  // Los datos del tab Open house viajan en la misma ola: dependen sólo del id
  // de la propiedad y del tenant del contexto, no de la fila de la propiedad.
  const tenantId = ctx.tenant_id
  const [p, tenantRow, openHouses, tags, sender, lastTimezone, agents] = await Promise.all([
    getPropertyById(id, tenantId),
    // Misma fila (y mismo round-trip) que el shell: ver getTenantRow.
    tenantId ? getTenantRow(tenantId) : Promise.resolve(null),
    tenantId ? listPropertyOpenHouses(id, tenantId) : Promise.resolve([]),
    tenantId ? listTenantTags(tenantId) : Promise.resolve([]),
    tenantId ? resolveOpenHouseSender(createAdminClient(), tenantId) : Promise.resolve({ ok: false as const, error: 'Selecciona un equipo.' }),
    tenantId ? lastOpenHouseTimezone(tenantId) : Promise.resolve(null),
    tenantId ? listSenderAgents(tenantId) : Promise.resolve([]),
  ])
  if (!p) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''
  // Hora por defecto de un open house nuevo: la de la zona principal del
  // negocio (configurada o deducida); si no hay, la del último open house.
  const defaultTimezone = businessTimeZone(mapBusinessProfile(tenantRow)) ?? lastTimezone
  // La marca es del tenant (migración 091): aplica a todas sus propiedades,
  // también a las que cargue después.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageManaged = (tenantRow as any)?.pages_managed_by_itmano === true

  const price = p.listPrice !== null
    ? `$${p.listPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—'

  const facts: { label: string; value: string }[] = [
    { label: 'Tipo', value: TYPE_LABELS[p.propertyType] ?? p.propertyType },
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

  // ── Tab Descripción: textos por idioma, fotos y notas a la izquierda; los
  //    datos de la ficha en lista a la derecha (una columna en pantallas
  //    estrechas, como el detalle del lead). ──────────────────────────────────
  const descripcionTab = (
    <div className="lead-detail-grid">
      <div className="lead-col">
        {contentLangs.length === 0 && (
          <div className="empty-card">
            Sin descripción todavía.{canEdit && ' Edita la propiedad para añadirla en cada idioma.'}
          </div>
        )}
        {contentLangs.map(l => (
          <section key={l} className="settings-card" aria-label={`Descripción en ${LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l}`}>
            <div className="prop-lang-title">
              {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l.toUpperCase()}
            </div>
            {p.descriptions[l]?.trim() && <p className="prop-text">{p.descriptions[l]}</p>}
            {(p.featuresI18n[l]?.length ?? 0) > 0 && (
              <ul className="prop-features">
                {p.featuresI18n[l].map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </section>
        ))}

        {gallery.length > 0 && (
          <section className="settings-card">
            <div className="settings-card-head"><h2 className="settings-card-title">Fotos</h2></div>
            <div className="prop-gallery">
              {gallery.map(url => (
                <div key={url} className="prop-photo">
                  <Image src={url} alt="" fill sizes="(max-width: 768px) 50vw, 200px" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="lead-col">
        <section className="settings-card">
          <div className="settings-card-head"><h2 className="settings-card-title">Ficha</h2></div>
          <dl className="info-list">
            {facts.map(f => (
              <div key={f.label} className="info-row">
                <dt className="info-label">{f.label}</dt>
                <dd className="info-value">{f.value}</dd>
              </div>
            ))}
            {p.mlsNumber && (
              <div className="info-row">
                <dt className="info-label">MLS</dt>
                <dd className="info-value">#{p.mlsNumber}</dd>
              </div>
            )}
            {p.externalUrl && (
              <div className="info-row">
                <dt className="info-label">Listado</dt>
                <dd className="info-value">
                  <a href={p.externalUrl} target="_blank" rel="noopener noreferrer" className="feed-link">
                    Ver listado externo
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        {p.notes && (
          <section className="settings-card">
            <div className="settings-card-head"><h2 className="settings-card-title">Notas internas</h2></div>
            <p className="prop-text">{p.notes}</p>
          </section>
        )}
      </div>
    </div>
  )

  const paginaTab = tenantSlug ? (
    <PropertyPageOptions
      propertyName={p.name ?? p.address}
      tenantSlug={tenantSlug}
      propertySlug={p.slug}
      published={p.publishedToWeb}
      managedByItmano={pageManaged}
    />
  ) : (
    <div className="empty-card">El tenant no tiene slug configurado.</div>
  )

  const openHouseTab = (
    <OpenHouseTab
      propertyId={p.id}
      openHouses={openHouses}
      tags={tags}
      agents={agents}
      defaultTagIds={tags.filter(t => (DEFAULT_AUDIENCE_TAG_SLUGS as readonly string[]).includes(t.slug)).map(t => t.id)}
      contentLanguages={p.contentLanguages}
      blockedReason={sender.ok ? null : sender.error}
      defaultTimezone={defaultTimezone}
    />
  )

  const status = STATUS_CONFIG[p.status]

  return (
    <>
      <Link href="/properties" className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> Propiedades
      </Link>

      <div className="page-header">
        <div className="lead-identity">
          {p.imageUrl && (
            <Image src={p.imageUrl} alt="" width={96} height={72} sizes="96px" className="prop-thumb" />
          )}
          <div className="prop-who">
            <div className="lead-identity-name">
              <h1 className="prop-identity-name">{p.name ?? p.address}</h1>
              <span className="pill" style={{ '--tone': status?.color } as React.CSSProperties}>
                {status?.label ?? p.status}
              </span>
              <span className="pill" data-tone={p.publishedToWeb ? undefined : 'mute'} style={p.publishedToWeb ? { '--tone': 'var(--gold-2)' } as React.CSSProperties : undefined}>
                {p.publishedToWeb ? 'Publicada en web' : 'Sin publicar'}
              </span>
            </div>
            <div className="lead-identity-meta">
              {[p.address, p.neighborhood, p.city, p.state].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="page-actions">
            <EditPropertyButton property={p} allowDelete={canEdit} />
          </div>
        )}
      </div>

      <PropertyDetailTabs
        descripcion={descripcionTab}
        pagina={paginaTab}
        openHouse={openHouseTab}
        openHouseCount={openHouses.filter(o => o.displayState === 'scheduled' || o.displayState === 'draft').length}
        initialTab={tab === 'openhouse' ? 'openhouse' : undefined}
      />
    </>
  )
}

// La cabecera es dato de la propiedad, así que toda la página espera detrás
// del Suspense (como el detalle del lead): el esqueleto sale al instante.
function PropertyDetailPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  return (
    <Suspense fallback={<PropertyDetailSkeleton />}>
      <PropertyContent {...props} />
    </Suspense>
  )
}

export default freshOnNavigation(PropertyDetailPage)
