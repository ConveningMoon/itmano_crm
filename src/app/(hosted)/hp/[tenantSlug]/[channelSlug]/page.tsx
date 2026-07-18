import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseHostedPage } from '@/lib/hosted-page'
import { HostedForm } from './hosted-form'

// Página alojada de un canal de adquisición (lead magnet / evento / contacto).
// Pública — llega por lm|events|forms.itmano.com/<tenant>/<canal> (rewrite del
// proxy) o directamente por /hp/... . La config vive en
// acquisition_channels.hosted_page (constructor en /sources/<canal>).

type Params = Promise<{ tenantSlug: string; channelSlug: string }>
type SearchParams = Promise<{ draft?: string }>

const HOSTED_TYPES = ['lead_magnet', 'event', 'contact_form']

async function loadPage(tenantSlug: string, channelSlug: string, allowDraft = false) {
  const db = createAdminClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color')
    .eq('slug', tenantSlug)
    .maybeSingle()
  if (!tenant) return null

  const t = tenant as { id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null }

  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, public_id, channel_type, name, slug, active, hosted_page')
    .eq('tenant_id', t.id)
    .eq('slug', channelSlug)
    .eq('active', true)
    .is('archived_at', null)
    .maybeSingle()
  if (!channel) return null

  const c = channel as {
    id: string; public_id: string; channel_type: string; name: string
    slug: string; active: boolean; hosted_page: unknown
  }
  if (!HOSTED_TYPES.includes(c.channel_type)) return null

  const config = parseHostedPage(c.hosted_page)
  // Borrador: el editor guarda enabled=false y previsualiza con ?draft=1 (la
  // URL solo la conoce quien edita — riesgo aceptable para un borrador).
  if (!config || (!config.enabled && !allowDraft)) return null

  return { tenant: t, channel: c, config }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantSlug, channelSlug } = await params
  const page = await loadPage(tenantSlug, channelSlug)
  if (!page) return { title: 'Página no disponible' }
  return {
    title: `${page.config.headline} — ${page.tenant.name}`,
    description: page.config.subheadline || undefined,
  }
}

export default async function HostedChannelPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { tenantSlug, channelSlug } = await params
  const { draft } = await searchParams
  const page = await loadPage(tenantSlug, channelSlug, draft === '1')
  if (!page) notFound()

  const { tenant, channel, config } = page
  const accent = tenant.primary_color || '#C9A96E'

  return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '48px 20px 64px' }}>
      {/* Marca del tenant */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px' }}>
        {tenant.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={tenant.logo_url} alt={tenant.name} style={{ height: '36px', width: 'auto', display: 'block' }} />
        ) : (
          <div style={{
            width: '36px', height: '36px', borderRadius: '8px',
            background: `${accent}22`, border: `1px solid ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: 700, color: accent,
          }}>
            {tenant.name.trim().slice(0, 1).toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{tenant.name}</span>
      </div>

      {/* Encabezado */}
      <h1 style={{ fontSize: 'clamp(26px, 6vw, 34px)', fontWeight: 600, lineHeight: 1.2, margin: 0, color: 'var(--text-primary)' }}>
        {config.headline}
      </h1>
      {config.subheadline && (
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '14px' }}>
          {config.subheadline}
        </p>
      )}

      {config.bullets.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {config.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <span aria-hidden style={{ color: accent, fontWeight: 700 }}>✓</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {/* Portada del material */}
      {config.cover_image_url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={config.cover_image_url}
          alt={config.headline}
          style={{ width: '100%', borderRadius: '12px', marginTop: '28px', display: 'block', border: '1px solid var(--border-subtle)' }}
        />
      )}

      {/* Beneficios (tarjetas "qué contiene") */}
      {config.benefits.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '12px', marginTop: '28px' }}>
          {config.benefits.map((b, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{b.title}</div>
              {b.desc && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '6px' }}>{b.desc}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Formulario */}
      <div style={{
        marginTop: '32px', background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '24px',
      }}>
        <HostedForm
          publicId={channel.public_id}
          channelType={channel.channel_type as 'lead_magnet' | 'event' | 'contact_form'}
          tenantSlug={tenantSlug}
          channelSlug={channelSlug}
          config={config}
          accent={accent}
        />
      </div>

      {/* Quién lo preparó (agent intro) */}
      {config.agent_intro?.name && (
        <div style={{
          marginTop: '32px', display: 'flex', gap: '16px', alignItems: 'flex-start',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '12px', padding: '20px',
        }}>
          {config.agent_intro.photo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={config.agent_intro.photo_url}
              alt={config.agent_intro.name}
              style={{ width: '64px', height: '64px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${accent}55` }}
            />
          )}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{config.agent_intro.name}</div>
            {config.agent_intro.title && (
              <div style={{ fontSize: '12px', color: accent, marginTop: '2px' }}>{config.agent_intro.title}</div>
            )}
            {config.agent_intro.paragraph && (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '10px 0 0' }}>
                {config.agent_intro.paragraph}
              </p>
            )}
          </div>
        </div>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '28px', textAlign: 'center' }}>
        {tenant.name} · Impulsado por ITMANO
      </p>
    </main>
  )
}
