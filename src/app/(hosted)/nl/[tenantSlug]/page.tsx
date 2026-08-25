import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Newspaper, ArrowUpRight, Mail } from 'lucide-react'
import {
  getPublicTenant, getPublicEditions, getPublicSeriesList,
  getPublicNewsletterPaths, getPublicSeriesPaths,
  type PublicEdition, type PublicSeries,
} from './shared'
import { formatEditionDate } from './nl-format'
import { pal, WRAP, DISPLAY, Masthead, Footer } from './nl-chrome'

// Portada pública de newsletters del tenant — news.itmano.com/<slug>.
//
// Dos secciones, en este orden: las SERIES del tenant (spec §6) y el feed de
// las ediciones publicadas de todas ellas, más reciente primero.
//
// La lista de series no es decorativa: el formulario de suscripción vive en el
// archivo de cada serie, y sin esta lista la única forma de llegar a él era
// entrar por una edición ya publicada. Para una función cuyo objetivo es
// captar suscriptores, eso dejaba la captación inalcanzable justo al principio.

// ISR: la página no lee cookies ni searchParams, así que se cachea y se sirve
// desde el edge en vez de renderizarse por visita — mismo razonamiento que el
// catálogo de propiedades (web/[tenantSlug]/page.tsx). Las server actions de
// newsletters revalidan esta ruta al publicar/despublicar una edición.
export const revalidate = 300

// Obligatorio para que la ruta entre al manifiesto de prerender: sin esto,
// `revalidate` no tiene efecto sobre un segmento dinámico (ver shared.ts).
//
// Se cruzan las dos fuentes a propósito: un tenant que ya creó su serie pero
// todavía no ha publicado nada tiene portada — con el enlace a su formulario de
// suscripción — desde el primer día. Lo que no aparezca aquí se sirve bajo
// demanda igual (dynamicParams por defecto).
export async function generateStaticParams() {
  const [editionPaths, seriesPaths] = await Promise.all([
    getPublicNewsletterPaths(),
    getPublicSeriesPaths(),
  ])
  const slugs = new Set([
    ...editionPaths.map(p => p.tenantSlug),
    ...seriesPaths.map(p => p.tenantSlug),
  ])
  return [...slugs].map(tenantSlug => ({ tenantSlug }))
}

type Params = Promise<{ tenantSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  return {
    title: `Newsletter — ${tenant.name}`,
    description: `Ediciones de la newsletter de ${tenant.name}.`,
  }
}

export default async function PublicNewsletterHomePage({ params }: { params: Params }) {
  const { tenantSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()

  const [series, editions] = await Promise.all([
    getPublicSeriesList(tenant.id),
    getPublicEditions(tenant.id),
  ])
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

        {/* Series — la puerta al archivo de cada una y a su formulario de suscripción. */}
        {series.length > 0 && (
          <section style={{ marginBottom: '48px' }}>
            <SectionTitle label="Series" P={P} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {series.map(s => (
                <SeriesCard key={s.id} tenantSlug={tenant.slug} series={s} P={P} />
              ))}
            </div>
          </section>
        )}

        {/* Feed de ediciones recientes de TODAS las series. */}
        <section>
          {series.length > 0 && editions.length > 0 && <SectionTitle label="Ediciones recientes" P={P} />}

          {editions.length === 0 ? (
            <div style={{ background: P.paperAlt, borderRadius: '18px', padding: '56px 24px', textAlign: 'center' }}>
              <Newspaper size={28} strokeWidth={1.2} color={P.textFaint} />
              <p style={{ color: P.textSoft, margin: '14px 0 0', fontSize: '15px' }}>
                {series.length > 0
                  ? 'Todavía no hay ediciones publicadas. Suscríbete a una serie para recibir la primera.'
                  : 'No hay ediciones publicadas todavía.'}
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

function SectionTitle({ label, P }: { label: string; P: ReturnType<typeof pal> }) {
  return (
    <h2 style={{
      fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase',
      color: P.textFaint, fontWeight: 700, margin: '0 0 16px',
    }}>
      {label}
    </h2>
  )
}

function SeriesCard({ tenantSlug, series, P }: { tenantSlug: string; series: PublicSeries; P: ReturnType<typeof pal> }) {
  return (
    <Link href={`/nl/${tenantSlug}/${series.slug}`} className="nlh-card" style={{
      display: 'flex', flexDirection: 'column', gap: '10px', textDecoration: 'none', color: 'inherit',
      background: '#fff', borderRadius: '16px', border: `1px solid ${P.line}`,
      padding: '20px', boxShadow: P.cardShadow,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '32px', height: '32px', borderRadius: '9px',
        background: `${P.accent}1F`, color: P.accent,
      }}>
        <Mail size={15} strokeWidth={1.8} />
      </span>
      <span style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.01em', color: P.ink }}>
        {series.name}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: P.textSoft }}>
        Ver el archivo y suscribirse
        <ArrowUpRight size={13} color={P.accent} />
      </span>
    </Link>
  )
}

function EditionCard({ tenantSlug, edition, P }: { tenantSlug: string; edition: PublicEdition; P: ReturnType<typeof pal> }) {
  const href = `/nl/${tenantSlug}/${edition.series_slug}/${edition.slug}`
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
        <span style={{
          alignSelf: 'flex-start', padding: '4px 11px', borderRadius: '999px',
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          background: `${P.accent}22`, color: P.ink, marginBottom: '10px',
        }}>
          {edition.series_name}
        </span>
        <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: P.ink }}>
          {edition.title}
        </h2>
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
