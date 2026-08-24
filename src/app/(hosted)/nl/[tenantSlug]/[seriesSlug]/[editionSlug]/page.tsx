import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { getPublicTenant, getPublicSeries, getPublicEdition, getPublicNewsletterPaths } from '../../shared'
import { formatDataAsOf, formatEditionDate } from '../../nl-format'
import { pal, WRAP, DISPLAY, Masthead, Footer } from '../../nl-chrome'
import { renderNewsletterHtml } from '@/lib/newsletters/render'

// Lectura pública de una edición — news.itmano.com/<slug>/<serie>/<edición>.

// ISR — mismo razonamiento que las otras dos páginas del escaparate.
export const revalidate = 300

// Obligatorio: sin esto `revalidate` no aplica a un segmento dinámico (ver
// shared.ts). getPublicNewsletterPaths ya trae exactamente esta forma.
export async function generateStaticParams() {
  return getPublicNewsletterPaths()
}

type Params = Promise<{ tenantSlug: string; seriesSlug: string; editionSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, seriesSlug, editionSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  const series = await getPublicSeries(tenant.id, seriesSlug)
  if (!series) return { title: 'Serie no disponible' }
  const edition = await getPublicEdition(tenant.id, series.id, editionSlug)
  if (!edition) return { title: 'Edición no disponible' }
  return {
    title: `${edition.title} — ${tenant.name}`,
    description: edition.dek ?? `${series.name} — ${tenant.name}`,
    openGraph: {
      images: [{ url: edition.cover_image_url }],
    },
  }
}

export default async function PublicNewsletterEditionPage({ params }: { params: Params }) {
  const { tenantSlug, seriesSlug, editionSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()
  const series = await getPublicSeries(tenant.id, seriesSlug)
  if (!series) notFound()
  const edition = await getPublicEdition(tenant.id, series.id, editionSlug)
  // Sin contenido parseable (jsonb roto o vacío) la edición no es renderizable:
  // mejor 404 que pintarla a medias. parseNewsletterContent ya corrió dentro
  // de getPublicEdition (shared.ts) — aquí sólo se comprueba el resultado.
  if (!edition || !edition.content) notFound()

  const P = pal(tenant.primary_color || '#C9A96E')
  // Único caller server-side de renderNewsletterHtml para esta página: el HTML
  // que produce ya viene con todo texto de usuario/IA escapado (render.ts,
  // Task 7) — es lo que hace seguro el dangerouslySetInnerHTML de abajo.
  const html = renderNewsletterHtml(edition.content, edition.sources)

  return (
    <div style={{ background: P.paper, color: P.ink, minHeight: '100vh' }}>
      <style>{`
        .nl-article h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: ${P.ink}; margin: 36px 0 14px; }
        .nl-article h3 { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; color: ${P.ink}; margin: 28px 0 12px; }
        .nl-article p { font-size: 16px; color: ${P.textSoft}; line-height: 1.8; margin: 0 0 18px; }
        .nl-article ul, .nl-article ol { font-size: 16px; color: ${P.textSoft}; line-height: 1.8; margin: 0 0 18px; padding-left: 22px; }
        .nl-article li { margin-bottom: 6px; }
        .nl-article figure { margin: 0 0 24px; }
        .nl-article img { width: 100%; border-radius: 14px; display: block; }
        .nl-article figcaption { font-size: 12px; color: ${P.textFaint}; margin-top: 8px; text-align: center; }
        .nl-article blockquote { margin: 0 0 24px; padding: 4px 0 4px 20px; border-left: 3px solid ${P.accent}; font-style: italic; color: ${P.ink}; font-size: 18px; line-height: 1.6; }
        .nl-article cite { display: block; margin-top: 8px; font-size: 12px; color: ${P.textFaint}; font-style: normal; }
        .nl-callout { display: block; margin: 0 0 20px; padding: 16px 18px; border-radius: 12px; font-size: 14.5px; line-height: 1.7; }
        .nl-callout-info { background: rgba(91,142,201,0.08); border: 1px solid rgba(91,142,201,0.25); color: ${P.ink}; }
        .nl-callout-warning { background: rgba(201,169,110,0.1); border: 1px solid rgba(201,169,110,0.3); color: ${P.ink}; }
        .nl-stat { display: flex; flex-direction: column; gap: 2px; margin: 0 0 20px; padding: 16px 18px; background: ${P.paperAlt}; border-radius: 12px; }
        .nl-stat-value { font-size: 30px; font-weight: 800; color: ${P.accent}; letter-spacing: -0.01em; }
        .nl-stat-label { font-size: 13px; color: ${P.textFaint}; }
        .nl-sources { margin-top: 32px; padding-top: 20px; border-top: 1px solid ${P.line}; }
        .nl-sources h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: ${P.textFaint}; margin: 0 0 12px; font-weight: 700; }
        .nl-sources ol { font-size: 13px; color: ${P.textSoft}; padding-left: 20px; margin: 0; line-height: 1.7; }
        .nl-sources a { color: ${P.accent}; }
      `}</style>

      <Masthead tenant={tenant} P={P} />

      <main style={{ ...WRAP, paddingTop: '26px', paddingBottom: '72px' }}>
        <Link href={`/nl/${tenant.slug}/${series.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: P.textFaint, textDecoration: 'none', marginBottom: '24px' }}>
          <ArrowLeft size={14} /> {series.name}
        </Link>

        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '18px', overflow: 'hidden', background: P.paperAlt, marginBottom: '28px' }}>
          <Image
            src={edition.cover_image_url}
            alt={edition.title}
            fill
            sizes="(max-width: 900px) 100vw, 852px"
            style={{ objectFit: 'cover' }}
            priority
          />
        </div>

        <h1 style={{ ...DISPLAY, fontSize: 'clamp(28px, 5vw, 42px)', margin: 0, color: P.ink }}>
          {edition.title}
        </h1>
        {edition.dek && (
          <p style={{ fontSize: '17px', color: P.textSoft, lineHeight: 1.6, margin: '14px 0 0' }}>
            {edition.dek}
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '12.5px', color: P.textFaint, marginTop: '18px', paddingBottom: '28px', borderBottom: `1px solid ${P.line}` }}>
          {edition.published_at && <span>Publicado el {formatEditionDate(edition.published_at)}</span>}
          {edition.data_as_of && <span>· Datos al {formatDataAsOf(edition.data_as_of)}</span>}
        </div>

        {/*
          El HTML de abajo lo produce SIEMPRE renderNewsletterHtml (src/lib/newsletters/render.ts),
          que escapa todo texto de usuario o IA antes de interpolarlo — nunca se guarda HTML en la
          base (newsletter_editions.content son bloques validados por zod). Es seguro inyectarlo
          así, y SÓLO aquí: cualquier otro dangerouslySetInnerHTML de este repo necesita la misma
          garantía explícita antes de copiarse.
        */}
        <div className="nl-article" style={{ marginTop: '28px' }} dangerouslySetInnerHTML={{ __html: html }} />

        <Footer tenant={tenant} P={P} />
      </main>
    </div>
  )
}
