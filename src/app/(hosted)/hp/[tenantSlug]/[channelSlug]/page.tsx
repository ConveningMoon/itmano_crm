import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CalendarDays, Clock, MapPin, AtSign, MessageCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseHostedPage } from '@/lib/hosted-page'
import { HostedForm } from './hosted-form'

// Página alojada de un canal de adquisición (lead magnet / evento / contacto).
// Pública — llega por lm|events|forms.itmano.com/<tenant>/<canal> (rewrite del
// proxy) o directamente por /hp/... . La config vive en
// acquisition_channels.hosted_page (constructor en /sources/<canal>).
//
// Diseño: masthead con el logo del tenant centrado, hero a ancho completo con
// la portada como fondo (overlay oscuro) y el formulario encima; secciones
// según el tipo (evento: datos con iconos · lead magnet: qué contiene, agente,
// testimonios, CTA final).

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
  const isLm    = channel.channel_type === 'lead_magnet'
  const isEvent = channel.channel_type === 'event'
  const hasEventInfo = isEvent && !!(config.event?.date || config.event?.time || config.event?.location)
  const intro = config.agent_intro
  const hasIntro = !!intro?.name

  const heroBg = config.cover_image_url
    ? `linear-gradient(to bottom, rgba(10,10,12,0.78) 0%, rgba(10,10,12,0.62) 55%, var(--bg-base) 100%), url("${config.cover_image_url}")`
    : `radial-gradient(1100px 500px at 50% -10%, ${accent}26, transparent 70%), var(--bg-base)`

  return (
    <>
      <style>{`
        @keyframes hp-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .hp-rise { animation: hp-rise 0.6s cubic-bezier(0.22,1,0.36,1) both; }
        .hp-d1 { animation-delay: 0.08s; } .hp-d2 { animation-delay: 0.16s; } .hp-d3 { animation-delay: 0.24s; }
        .hp-card { transition: transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.3s; }
        .hp-card:hover { transform: translateY(-3px); box-shadow: 0 16px 36px -22px rgba(0,0,0,0.55); }
        @media (prefers-reduced-motion: reduce) { .hp-rise, .hp-card { animation: none !important; transition: none !important; } }
        .hp-wrap { max-width: 1180px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
        .hp-hero-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 56px; align-items: start; }
        .hp-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .hp-intro-grid { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 32px; align-items: start; }
        @media (max-width: 960px) {
          .hp-hero-grid { grid-template-columns: 1fr; gap: 36px; }
          .hp-grid-3 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 620px) {
          .hp-grid-3 { grid-template-columns: 1fr; }
          .hp-intro-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Masthead — logo del tenant centrado */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'color-mix(in srgb, var(--bg-base) 82%, transparent)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div className="hp-wrap" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
            {tenant.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tenant.logo_url} alt={tenant.name} style={{ height: '38px', width: 'auto', display: 'block' }} />
            ) : (
              <span style={{
                width: '38px', height: '38px', borderRadius: '9px',
                background: `${accent}1f`, border: `1px solid ${accent}55`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '16px', fontWeight: 700, color: accent,
              }}>{tenant.name.trim().slice(0, 1).toUpperCase()}</span>
            )}
            <span style={{ fontSize: '17px', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{tenant.name}</span>
          </span>
        </div>
      </header>

      <main>
        {/* ── Hero: portada como fondo a lo ancho + formulario encima ────────── */}
        <section
          id="form"
          style={{
            backgroundImage: heroBg,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="hp-wrap hp-hero-grid" style={{ paddingTop: 'clamp(48px, 8vw, 88px)', paddingBottom: 'clamp(48px, 8vw, 88px)' }}>
            {/* Columna de texto */}
            <div className="hp-rise">
              {config.badge && (
                <div style={{
                  display: 'inline-block', fontSize: '11px', fontWeight: 600, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: accent, background: `${accent}1a`,
                  border: `1px solid ${accent}44`, borderRadius: '999px', padding: '6px 14px', marginBottom: '18px',
                }}>
                  {config.badge}
                </div>
              )}
              <h1 style={{ fontSize: 'clamp(30px, 5vw, 50px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.08, margin: 0, color: 'var(--text-primary)' }}>
                {config.headline}
              </h1>
              {config.subheadline && (
                <p style={{ fontSize: 'clamp(15px, 2vw, 17px)', color: 'var(--text-secondary)', lineHeight: 1.65, marginTop: '18px', maxWidth: '560px' }}>
                  {config.subheadline}
                </p>
              )}

              {/* Datos del evento con iconos */}
              {hasEventInfo && (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '24px' }}>
                  {config.event?.date && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      <CalendarDays size={16} color={accent} /> {config.event.date}
                    </span>
                  )}
                  {config.event?.time && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      <Clock size={16} color={accent} /> {config.event.time}
                    </span>
                  )}
                  {config.event?.location && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      <MapPin size={16} color={accent} /> {config.event.location}
                    </span>
                  )}
                </div>
              )}
              {isEvent && config.event?.short_description && (
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, marginTop: '16px', maxWidth: '560px' }}>
                  {config.event.short_description}
                </p>
              )}

              {config.bullets.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '26px 0 0', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '540px' }}>
                  {config.bullets.map((b, i) => (
                    <li key={i} style={{ display: 'flex', gap: '12px', fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      <span aria-hidden style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Formulario — tarjeta glass sobre el fondo */}
            <div className="hp-rise hp-d1" style={{
              background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid var(--border-subtle)', borderRadius: '16px',
              padding: '28px', boxShadow: '0 24px 60px -30px rgba(0,0,0,0.6)',
            }}>
              {(isLm && (config.form_title || config.form_subtitle)) && (
                <div style={{ marginBottom: '20px' }}>
                  {config.form_title && (
                    <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{config.form_title}</div>
                  )}
                  {config.form_subtitle && (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.55, marginTop: '6px' }}>{config.form_subtitle}</div>
                  )}
                </div>
              )}
              <HostedForm
                publicId={channel.public_id}
                channelType={channel.channel_type as 'lead_magnet' | 'event' | 'contact_form'}
                tenantSlug={tenantSlug}
                channelSlug={channelSlug}
                config={config}
                accent={accent}
              />
              {config.microcopy && (
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'center', margin: '14px 0 0' }}>{config.microcopy}</p>
              )}
            </div>
          </div>
        </section>

        {/* ── Qué contiene / beneficios ──────────────────────────────────────── */}
        {config.benefits.length > 0 && (
          <section className="hp-wrap" style={{ paddingTop: '64px', paddingBottom: '24px' }}>
            {(config.benefits_title || config.benefits_subtitle) && (
              <div className="hp-rise" style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 36px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, fontWeight: 600, marginBottom: '12px' }}>
                  {isLm ? 'Lo que contiene' : 'Beneficios'}
                </div>
                {config.benefits_title && (
                  <h2 style={{ fontSize: 'clamp(22px, 3.4vw, 32px)', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, margin: 0, color: 'var(--text-primary)' }}>
                    {config.benefits_title}
                  </h2>
                )}
                {config.benefits_subtitle && (
                  <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', lineHeight: 1.65, marginTop: '14px' }}>
                    {config.benefits_subtitle}
                  </p>
                )}
              </div>
            )}
            <div className="hp-grid-3">
              {config.benefits.map((b, i) => (
                <div key={i} className="hp-card hp-rise" style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: '14px', padding: '22px', animationDelay: `${0.06 * i}s`,
                }}>
                  <div style={{
                    width: '34px', height: '34px', borderRadius: '9px', marginBottom: '14px',
                    background: `${accent}1a`, border: `1px solid ${accent}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: accent,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>{b.title}</div>
                  {b.desc && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '8px' }}>{b.desc}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Quién lo preparó ───────────────────────────────────────────────── */}
        {hasIntro && (
          <section className="hp-wrap" style={{ paddingTop: '56px', paddingBottom: '24px' }}>
            <div className="hp-rise hp-intro-grid" style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: '18px', padding: 'clamp(24px, 4vw, 40px)',
            }}>
              {intro?.photo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={intro.photo_url}
                  alt={intro.name}
                  style={{ width: '100%', maxWidth: '180px', aspectRatio: '1', borderRadius: '16px', objectFit: 'cover', border: `2px solid ${accent}44` }}
                />
              ) : <div />}
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, fontWeight: 600, marginBottom: '10px' }}>
                  {isEvent ? 'Quién lo organiza' : 'Quién lo preparó'}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>{intro?.name}</div>
                {intro?.title && <div style={{ fontSize: '13px', color: accent, marginTop: '4px' }}>{intro.title}</div>}
                {intro?.paragraph && (
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '16px 0 0' }}>{intro.paragraph}</p>
                )}
                {intro?.quote && (
                  <p style={{
                    fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.6, margin: '18px 0 0',
                    paddingLeft: '16px', borderLeft: `3px solid ${accent}`, fontStyle: 'italic',
                  }}>
                    “{intro.quote}”
                  </p>
                )}
                {(intro?.whatsapp_url || intro?.instagram_url) && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                    {intro?.whatsapp_url && (
                      <a href={intro.whatsapp_url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500,
                        color: 'var(--text-primary)', textDecoration: 'none', padding: '8px 16px',
                        border: '1px solid var(--border-subtle)', borderRadius: '999px', background: 'var(--bg-elevated)',
                      }}>
                        <MessageCircle size={14} color={accent} /> WhatsApp
                      </a>
                    )}
                    {intro?.instagram_url && (
                      <a href={intro.instagram_url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 500,
                        color: 'var(--text-primary)', textDecoration: 'none', padding: '8px 16px',
                        border: '1px solid var(--border-subtle)', borderRadius: '999px', background: 'var(--bg-elevated)',
                      }}>
                        <AtSign size={14} color={accent} /> Instagram
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Testimonios ────────────────────────────────────────────────────── */}
        {config.testimonials.length > 0 && (
          <section className="hp-wrap" style={{ paddingTop: '56px', paddingBottom: '24px' }}>
            <div className="hp-rise" style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 36px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase', color: accent, fontWeight: 600, marginBottom: '12px' }}>
                Testimonios
              </div>
              {config.testimonials_title && (
                <h2 style={{ fontSize: 'clamp(22px, 3.4vw, 32px)', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, margin: 0, color: 'var(--text-primary)' }}>
                  {config.testimonials_title}
                </h2>
              )}
            </div>
            <div className="hp-grid-3">
              {config.testimonials.map((t, i) => (
                <figure key={i} className="hp-card hp-rise" style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: '14px', padding: '22px', margin: 0, display: 'flex', flexDirection: 'column',
                  gap: '16px', animationDelay: `${0.06 * i}s`,
                }}>
                  <blockquote style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, flex: 1 }}>
                    “{t.quote}”
                  </blockquote>
                  <figcaption style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {t.photo_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={t.photo_url} alt={t.name} style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                    )}
                    <span>
                      <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</span>
                      {t.location && <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{t.location}</span>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA final ──────────────────────────────────────────────────────── */}
        {(config.final_cta_title || config.final_cta_paragraph) && (
          <section className="hp-wrap" style={{ paddingTop: '64px', paddingBottom: '32px' }}>
            <div className="hp-rise" style={{
              textAlign: 'center', maxWidth: '640px', margin: '0 auto',
              background: `linear-gradient(180deg, ${accent}14, transparent)`,
              border: `1px solid ${accent}33`, borderRadius: '18px', padding: 'clamp(32px, 5vw, 52px)',
            }}>
              {config.final_cta_title && (
                <h2 style={{ fontSize: 'clamp(22px, 3.4vw, 30px)', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.2, margin: 0, color: 'var(--text-primary)' }}>
                  {config.final_cta_title}
                </h2>
              )}
              {config.final_cta_paragraph && (
                <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: '14px auto 0', maxWidth: '480px' }}>
                  {config.final_cta_paragraph}
                </p>
              )}
              <a href="#form" style={{
                display: 'inline-block', marginTop: '24px', padding: '13px 28px',
                fontSize: '14px', fontWeight: 600, background: accent, color: '#0F0F10',
                borderRadius: '10px', textDecoration: 'none',
              }}>
                {config.cta_label || 'Quiero el material'}
              </a>
            </div>
          </section>
        )}

        <footer style={{ padding: '40px 24px 48px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            {tenant.name} · Impulsado por ITMANO
          </p>
        </footer>
      </main>
    </>
  )
}
