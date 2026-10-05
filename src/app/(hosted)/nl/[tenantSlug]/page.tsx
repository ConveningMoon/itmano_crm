import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Newspaper, ArrowUpRight } from 'lucide-react'
import { cacheLife, cacheTag } from 'next/cache'
import {
  getPublicTenant, getPublicEditions, getPublicNewsletterChannel, getPublicTenantSlugs,
  type PublicEdition,
} from './shared'
import { formatEditionDate } from './nl-format'
import { EditionByline } from './edition-byline'
import { pal, WRAP, DISPLAY, Masthead, Footer } from './nl-chrome'
import { SubscribeForm } from './subscribe-form'
import { alMenosUnParametro, hostedTag } from '@/lib/hosted-cache'

// instant = false a propósito: la página espera sus params fuera de un
// <Suspense> para poder responder 404 de verdad. Los slugs que lista
// generateStaticParams salen prerenderizados igual; uno nuevo se renderiza en
// su primera visita y queda cacheado desde ahí, como el ISR al que sustituye.
export const instant = false

// Portada pública de la newsletter del tenant — news.itmano.com/<slug>.
//
// Un tenant tiene UNA newsletter implícita, así que esta página es el archivo
// completo: el formulario de suscripción (antes vivía en la página de la
// serie) más el feed de ediciones publicadas, más reciente primero.

// Cacheada: la página no lee cookies ni searchParams, así que se prerenderiza
// y se sirve desde el edge en vez de renderizarse por visita — mismo
// razonamiento que el catálogo de propiedades (web/[tenantSlug]/page.tsx). Las
// server actions de newsletters la invalidan al publicar/despublicar una
// edición; el perfil `hosted` (5 minutos) sólo es el techo.
async function loadHome(tenantSlug: string) {
  'use cache'
  cacheLife('hosted')
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return null
  cacheTag(hostedTag.nl(tenant.id))
  const [editions, channel] = await Promise.all([
    getPublicEditions(tenant.id),
    getPublicNewsletterChannel(tenant.id),
  ])
  return { tenant, editions, channel }
}

export async function generateStaticParams() {
  const tenantSlugs = await getPublicTenantSlugs()
  return alMenosUnParametro(tenantSlugs.map(tenantSlug => ({ tenantSlug })), ['tenantSlug'])
}

type Params = Promise<{ tenantSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug } = await params
  const home = await loadHome(tenantSlug)
  if (!home) return { title: 'Página no disponible' }
  const { tenant } = home
  return {
    title: `Newsletter — ${tenant.name}`,
    description: `Ediciones de la newsletter de ${tenant.name}.`,
  }
}

export default async function PublicNewsletterHomePage({ params }: { params: Params }) {
  const { tenantSlug } = await params
  const home = await loadHome(tenantSlug)
  if (!home) notFound()

  const { tenant, editions, channel } = home
  const P = pal(tenant.primary_color || '#C9A96E')

  return (
    <div style={{ background: P.paper, color: P.ink, minHeight: '100vh' }}>
      <style>{`
        .nlh-card { transition: box-shadow .35s cubic-bezier(0.22,1,0.36,1), transform .35s cubic-bezier(0.22,1,0.36,1); }
        .nlh-card:hover { transform: translateY(-3px); box-shadow: 0 26px 56px -30px rgba(18,33,47,0.5); }
        .nlh-img { transition: transform .6s cubic-bezier(0.22,1,0.36,1); }
        .nlh-card:hover .nlh-img { transform: scale(1.05); }
        @media (prefers-reduced-motion: reduce) { .nlh-card, .nlh-img { transition: none !important; } }
      `}</style>

      <Masthead tenant={tenant} P={P} />

      <main style={{ ...WRAP, paddingTop: '48px', paddingBottom: '72px' }}>
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: P.accent, fontWeight: 700, marginBottom: '10px' }}>
            Newsletter
          </div>
          <h1 style={{ ...DISPLAY, fontSize: 'clamp(28px, 5vw, 44px)', margin: 0, color: P.ink }}>
            La newsletter de {tenant.name}
          </h1>
        </div>

        {channel && (
          <div style={{ marginBottom: '48px' }}>
            <SubscribeForm publicId={channel.publicId} tenantName={tenant.name} P={P} />
          </div>
        )}

        <section>
          {editions.length === 0 ? (
            <div style={{ background: P.paperAlt, borderRadius: '18px', padding: '56px 24px', textAlign: 'center' }}>
              <Newspaper size={28} strokeWidth={1.2} color={P.textFaint} />
              <p style={{ color: P.textSoft, margin: '14px 0 0', fontSize: '15px' }}>
                No hay ediciones publicadas todavía.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {editions.map(edition => (
                <EditionCard key={edition.id} tenantSlug={tenant.slug} edition={edition} P={P} />
              ))}
            </div>
          )}
        </section>

        <Footer tenant={tenant} P={P} />
      </main>
    </div>
  )
}

function EditionCard({ tenantSlug, edition, P }: { tenantSlug: string; edition: PublicEdition; P: ReturnType<typeof pal> }) {
  const href = `/nl/${tenantSlug}/${edition.slug}`
  return (
    <Link href={href} className="nlh-card" style={{
      display: 'flex', gap: '20px', alignItems: 'stretch', textDecoration: 'none', color: 'inherit',
      background: '#fff', borderRadius: '16px', border: `1px solid ${P.line}`, overflow: 'hidden',
      boxShadow: P.cardShadow,
    }}>
      <div style={{ position: 'relative', width: '180px', minWidth: '180px', aspectRatio: '4 / 3', overflow: 'hidden', background: P.paperAlt }}>
        <Image
          className="nlh-img"
          src={edition.cover_image_url}
          alt={edition.title}
          fill
          sizes="180px"
          style={{ objectFit: 'cover' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '18px 22px 18px 0', minWidth: 0 }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: P.ink }}>
          {edition.title}
        </h2>
        <EditionByline edition={edition} P={P} size={20} fontSize={12} />
        {edition.dek && (
          <p style={{ fontSize: '13.5px', color: P.textSoft, margin: '6px 0 0', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {edition.dek}
          </p>
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: P.textFaint, marginTop: '12px' }}>
          {formatEditionDate(edition.published_at)}
          <ArrowUpRight size={13} color={P.accent} />
        </div>
      </div>
    </Link>
  )
}
