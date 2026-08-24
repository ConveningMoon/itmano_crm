import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowUpRight, Newspaper } from 'lucide-react'
import { getPublicTenant, getPublicSeries, getPublicEditions, getPublicNewsletterPaths, type PublicEdition } from '../shared'
import { formatEditionDate } from '../nl-format'
import { pal, WRAP, DISPLAY, Masthead, Footer } from '../nl-chrome'

// Archivo público de una serie de newsletter — news.itmano.com/<slug>/<serie>.
// Todas las ediciones publicadas de esa serie, más reciente primero.

// ISR — mismo razonamiento que la portada.
export const revalidate = 300

// Igual que la portada: sin esto `revalidate` no aplica a este segmento
// dinámico. Sólo series con al menos una edición publicada.
export async function generateStaticParams() {
  const paths = await getPublicNewsletterPaths()
  const seen = new Set<string>()
  const out: { tenantSlug: string; seriesSlug: string }[] = []
  for (const p of paths) {
    const key = `${p.tenantSlug}/${p.seriesSlug}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ tenantSlug: p.tenantSlug, seriesSlug: p.seriesSlug })
  }
  return out
}

type Params = Promise<{ tenantSlug: string; seriesSlug: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, seriesSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) return { title: 'Página no disponible' }
  const series = await getPublicSeries(tenant.id, seriesSlug)
  if (!series) return { title: 'Serie no disponible' }
  return {
    title: `${series.name} — ${tenant.name}`,
    description: `Ediciones de ${series.name}, la newsletter de ${tenant.name}.`,
  }
}

export default async function PublicNewsletterSeriesPage({ params }: { params: Params }) {
  const { tenantSlug, seriesSlug } = await params
  const tenant = await getPublicTenant(tenantSlug)
  if (!tenant) notFound()
  const series = await getPublicSeries(tenant.id, seriesSlug)
  if (!series) notFound()

  const editions = await getPublicEditions(tenant.id, series.id)
  const P = pal(tenant.primary_color || '#C9A96E')

  return (
    <div style={{ background: P.paper, color: P.ink, minHeight: '100vh' }}>
      <style>{`
        .nls-card { transition: box-shadow .35s cubic-bezier(0.22,1,0.36,1), transform .35s cubic-bezier(0.22,1,0.36,1); }
        .nls-card:hover { transform: translateY(-3px); box-shadow: 0 26px 56px -30px rgba(18,33,47,0.5); }
        .nls-img { transition: transform .6s cubic-bezier(0.22,1,0.36,1); }
        .nls-card:hover .nls-img { transform: scale(1.05); }
        @media (prefers-reduced-motion: reduce) { .nls-card, .nls-img { transition: none !important; } }
      `}</style>

      <Masthead tenant={tenant} P={P} />

      <main style={{ ...WRAP, paddingTop: '26px', paddingBottom: '72px' }}>
        <Link href={`/nl/${tenant.slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: P.textFaint, textDecoration: 'none', marginBottom: '20px' }}>
          <ArrowLeft size={14} /> Volver a la newsletter
        </Link>

        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: P.accent, fontWeight: 700, marginBottom: '10px' }}>
            Serie
          </div>
          <h1 style={{ ...DISPLAY, fontSize: 'clamp(28px, 5vw, 44px)', margin: 0, color: P.ink }}>
            {series.name}
          </h1>
        </div>

        {editions.length === 0 ? (
          <div style={{ background: P.paperAlt, borderRadius: '18px', padding: '56px 24px', textAlign: 'center' }}>
            <Newspaper size={28} strokeWidth={1.2} color={P.textFaint} />
            <p style={{ color: P.textSoft, margin: '14px 0 0', fontSize: '15px' }}>No hay ediciones publicadas todavía.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {editions.map(edition => (
              <EditionCard key={edition.id} tenantSlug={tenant.slug} edition={edition} P={P} />
            ))}
          </div>
        )}

        <Footer tenant={tenant} P={P} />
      </main>
    </div>
  )
}

function EditionCard({ tenantSlug, edition, P }: { tenantSlug: string; edition: PublicEdition; P: ReturnType<typeof pal> }) {
  const href = `/nl/${tenantSlug}/${edition.series_slug}/${edition.slug}`
  return (
    <Link href={href} className="nls-card" style={{
      display: 'flex', gap: '20px', alignItems: 'stretch', textDecoration: 'none', color: 'inherit',
      background: '#fff', borderRadius: '16px', border: `1px solid ${P.line}`, overflow: 'hidden',
      boxShadow: P.cardShadow,
    }}>
      <div style={{ position: 'relative', width: '180px', minWidth: '180px', aspectRatio: '4 / 3', overflow: 'hidden', background: P.paperAlt }}>
        <Image
          className="nls-img"
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
