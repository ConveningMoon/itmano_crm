'use client'

import { m } from 'motion/react'
import { CalendarDays, Clock, MapPin, AtSign, MessageCircle, Check, ArrowRight } from 'lucide-react'
import { HostedForm } from './hosted-form'
import type { HostedPageConfig } from '@/lib/hosted-page'

// Vista pública de una página alojada — tema claro editorial (referencias del
// usuario: evento a dos columnas con tarjeta oscura del formulario; lead magnet
// multi-sección tipo landing). Animaciones con motion (m.*, whileInView).

interface Tenant { id: string; name: string; slug: string; logo_url: string | null; primary_color: string | null }
interface Channel { id: string; public_id: string; channel_type: string; name: string; slug: string }

const rise = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
}

function pal(accent: string) {
  return {
    accent,
    ink: '#12212F',
    inkDeep: '#0C1621',
    paper: '#FBFAF8',
    paperAlt: '#F3F1EC',
    text: '#12212F',
    textSoft: 'rgba(18,33,47,0.66)',
    textFaint: 'rgba(18,33,47,0.5)',
    line: 'rgba(18,33,47,0.10)',
    onDark: '#FFFFFF',
    onDarkSoft: 'rgba(255,255,255,0.74)',
    onDarkFaint: 'rgba(255,255,255,0.5)',
    onDarkLine: 'rgba(255,255,255,0.14)',
    cardShadow: '0 22px 50px -30px rgba(18,33,47,0.42)',
  }
}
type Pal = ReturnType<typeof pal>

const DISPLAY: React.CSSProperties = { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.04 }
const WRAP: React.CSSProperties = { maxWidth: '1120px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '24px', paddingRight: '24px' }

// Eyebrow con línea + texto en versalitas.
function Eyebrow({ children, color, line }: { children: React.ReactNode; color: string; line: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
      <span style={{ width: '26px', height: '2px', background: line, borderRadius: '2px' }} />
      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color }}>{children}</span>
    </div>
  )
}

export function HostedPageView({ tenant, channel, config }: { tenant: Tenant; channel: Channel; config: HostedPageConfig }) {
  const P = pal(tenant.primary_color || '#C9A96E')
  const type = channel.channel_type as 'lead_magnet' | 'event' | 'contact_form'

  return (
    <div style={{ background: P.paper, color: P.text, minHeight: '100vh' }}>
      <style>{`
        .hpv-cta { transition: filter .16s ease, transform .16s ease; }
        .hpv-cta:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .hpv-hero-grid { display: grid; grid-template-columns: minmax(0,1fr) 440px; gap: 56px; align-items: center; }
        .hpv-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .hpv-intro { display: grid; grid-template-columns: 300px minmax(0,1fr); gap: 40px; align-items: center; }
        @media (max-width: 940px) {
          .hpv-hero-grid { grid-template-columns: 1fr; gap: 36px; }
          .hpv-cards { grid-template-columns: repeat(2, 1fr); }
          .hpv-intro { grid-template-columns: 1fr; gap: 24px; }
        }
        @media (max-width: 600px) { .hpv-cards { grid-template-columns: 1fr; } }
      `}</style>

      {/* Masthead — logo del tenant centrado */}
      <header style={{ borderBottom: `1px solid ${P.line}`, background: 'rgba(251,250,248,0.86)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 30 }}>
        <div style={{ ...WRAP, padding: '15px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
            {tenant.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tenant.logo_url} alt={tenant.name} style={{ height: '36px', width: 'auto', display: 'block' }} />
            ) : (
              <span style={{ width: '36px', height: '36px', borderRadius: '9px', background: `${P.accent}22`, border: `1px solid ${P.accent}66`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 800, color: P.accent }}>
                {tenant.name.trim().slice(0, 1).toUpperCase()}
              </span>
            )}
            <span style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-0.01em', color: P.ink }}>{tenant.name}</span>
          </span>
        </div>
      </header>

      {type === 'lead_magnet'
        ? <LeadMagnetView tenant={tenant} channel={channel} config={config} P={P} />
        : <SplitView tenant={tenant} channel={channel} config={config} P={P} type={type} />}

      <footer style={{ padding: '34px 24px 46px', borderTop: `1px solid ${P.line}` }}>
        <p style={{ fontSize: '11px', color: P.textFaint, textAlign: 'center', margin: 0 }}>
          {tenant.name} · Impulsado por ITMANO
        </p>
      </footer>
    </div>
  )
}

// ─── Evento y formulario: dos columnas, tarjeta oscura del formulario ─────────
function SplitView({ tenant, channel, config, P, type }: { tenant: Tenant; channel: Channel; config: HostedPageConfig; P: Pal; type: 'event' | 'contact_form' }) {
  const isEvent = type === 'event'
  const ev = config.event
  const hasEventLine = isEvent && !!(ev?.date || ev?.time || ev?.location)
  const eventParts = [ev?.date, ev?.time, ev?.location].filter(Boolean) as string[]

  return (
    <main>
      <section style={{ ...WRAP, paddingTop: 'clamp(44px, 7vw, 84px)', paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <div className="hpv-hero-grid">
          {/* Columna de texto */}
          <m.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            <Eyebrow color={P.accent} line={P.accent}>{config.badge || channel.name}</Eyebrow>
            <h1 style={{ ...DISPLAY, fontSize: 'clamp(34px, 6vw, 60px)', color: P.ink, margin: 0 }}>{config.headline}</h1>
            {config.subheadline && (
              <p style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', color: P.textSoft, lineHeight: 1.6, marginTop: '18px', maxWidth: '520px' }}>{config.subheadline}</p>
            )}

            {/* Línea de detalles del evento con iconos */}
            {hasEventLine && (
              <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '22px' }}>
                {ev?.date && <DetailChip icon={<CalendarDays size={16} />} accent={P.accent} ink={P.ink}>{ev.date}</DetailChip>}
                {ev?.time && <DetailChip icon={<Clock size={16} />} accent={P.accent} ink={P.ink}>{ev.time}</DetailChip>}
                {ev?.location && <DetailChip icon={<MapPin size={16} />} accent={P.accent} ink={P.ink}>{ev.location}</DetailChip>}
              </div>
            )}
            {isEvent && !hasEventLine && eventParts.length === 0 && ev?.short_description && (
              <p style={{ fontSize: '15px', color: P.textSoft, lineHeight: 1.6, marginTop: '16px', maxWidth: '520px' }}>{ev.short_description}</p>
            )}
            {isEvent && hasEventLine && ev?.short_description && (
              <p style={{ fontSize: '15px', color: P.textSoft, lineHeight: 1.6, marginTop: '16px', maxWidth: '520px' }}>{ev.short_description}</p>
            )}

            {/* Puntos clave (formulario sobre todo, evento opcional) */}
            {config.bullets.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '500px' }}>
                {config.bullets.map((b, i) => (
                  <m.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07, duration: 0.4 }} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', fontSize: '15px', color: P.text }}>
                    <span style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: `${P.accent}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                      <Check size={12} color={P.accent} strokeWidth={3} />
                    </span>
                    {b}
                  </m.li>
                ))}
              </ul>
            )}
          </m.div>

          {/* Tarjeta oscura del formulario */}
          <m.div
            id="form"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            style={{ position: 'relative', background: P.ink, borderRadius: '20px', padding: '30px', boxShadow: P.cardShadow, overflow: 'hidden' }}
          >
            {/* Glow decorativo */}
            <div style={{ position: 'absolute', top: '-60px', right: '-40px', width: '200px', height: '200px', borderRadius: '50%', background: `radial-gradient(circle, ${P.accent}44, transparent 65%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 700, color: P.onDark, margin: 0, letterSpacing: '-0.01em' }}>
                {config.form_title || (isEvent ? 'Reserva tu lugar' : 'Escríbenos')}
              </h2>
              <p style={{ fontSize: '13.5px', color: P.onDarkSoft, lineHeight: 1.55, margin: '8px 0 22px' }}>
                {config.form_subtitle || (isEvent ? 'Completa el formulario y guardamos tu cupo.' : 'Déjanos tus datos y te contactamos.')}
              </p>
              <HostedForm
                publicId={channel.public_id}
                channelType={type}
                tenantSlug={tenant.slug}
                channelSlug={channel.slug}
                config={config}
                accent={P.accent}
                surface="dark"
              />
              {config.microcopy && (
                <p style={{ fontSize: '11.5px', color: P.onDarkFaint, textAlign: 'center', margin: '14px 0 0' }}>{config.microcopy}</p>
              )}
            </div>
          </m.div>
        </div>
      </section>

      {/* Beneficios (tarjetas) si el constructor las tiene */}
      {config.benefits.length > 0 && (
        <BenefitsSection config={config} P={P} />
      )}
    </main>
  )
}

function DetailChip({ icon, accent, ink, children }: { icon: React.ReactNode; accent: string; ink: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 600, color: ink }}>
      <span style={{ color: accent, display: 'inline-flex' }}>{icon}</span>
      {children}
    </span>
  )
}

// ─── Lead magnet: landing multi-sección ──────────────────────────────────────
function LeadMagnetView({ tenant, channel, config, P }: { tenant: Tenant; channel: Channel; config: HostedPageConfig; P: Pal }) {
  const intro = config.agent_intro
  const hasIntro = !!intro?.name
  const heroBg = config.cover_image_url
    ? `linear-gradient(to bottom, rgba(12,22,33,0.82), rgba(12,22,33,0.9)), url("${config.cover_image_url}")`
    : `radial-gradient(900px 500px at 15% -10%, ${P.accent}33, transparent 70%), ${P.inkDeep}`

  return (
    <main>
      {/* Hero oscuro */}
      <section style={{ background: heroBg, backgroundSize: 'cover', backgroundPosition: 'center', color: P.onDark }}>
        <div style={{ ...WRAP, paddingTop: 'clamp(52px, 8vw, 96px)', paddingBottom: 'clamp(52px, 8vw, 96px)' }}>
          <div className="hpv-hero-grid">
            <m.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
              {config.badge && <Eyebrow color={P.accent} line={P.accent}>{config.badge}</Eyebrow>}
              <h1 style={{ ...DISPLAY, fontSize: 'clamp(34px, 6vw, 62px)', color: P.onDark, margin: 0 }}>{config.headline}</h1>
              {config.subheadline && (
                <p style={{ fontSize: 'clamp(15px, 1.8vw, 18px)', color: P.onDarkSoft, lineHeight: 1.6, marginTop: '18px', maxWidth: '520px' }}>{config.subheadline}</p>
              )}
              {config.bullets.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '26px 0 0', display: 'flex', flexDirection: 'column', gap: '13px', maxWidth: '520px' }}>
                  {config.bullets.map((b, i) => (
                    <m.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07, duration: 0.4 }} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', fontSize: '15px', color: P.onDark }}>
                      <span style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: `${P.accent}33`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                        <Check size={12} color={P.accent} strokeWidth={3} />
                      </span>
                      {b}
                    </m.li>
                  ))}
                </ul>
              )}
              <div style={{ marginTop: '30px' }}>
                <a href="#form" className="hpv-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '14px 28px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', background: P.accent, color: P.ink, borderRadius: '12px', textDecoration: 'none' }}>
                  {config.cta_label || 'Quiero el material'} <ArrowRight size={17} />
                </a>
                {config.microcopy && <div style={{ fontSize: '12px', color: P.onDarkFaint, marginTop: '12px' }}>{config.microcopy}</div>}
              </div>
            </m.div>

            {/* Portada flotante con glow */}
            {config.cover_image_url && (
              <m.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', padding: '30px' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${P.accent}55, transparent 62%)`, borderRadius: '50%' }} />
                  <m.img
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 4, ease: 'easeInOut', repeat: Infinity }}
                    src={config.cover_image_url}
                    alt={config.headline}
                    style={{ position: 'relative', maxWidth: '320px', width: '100%', height: 'auto', borderRadius: '14px', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)', display: 'block' }}
                  />
                </div>
              </m.div>
            )}
          </div>
        </div>
      </section>

      {/* Beneficios */}
      {config.benefits.length > 0 && <BenefitsSection config={config} P={P} />}

      {/* Agente */}
      {hasIntro && (
        <section style={{ background: P.paper }}>
          <div style={{ ...WRAP, paddingTop: '56px', paddingBottom: '56px' }}>
            <m.div {...rise} className="hpv-intro" style={{ background: P.paperAlt, border: `1px solid ${P.line}`, borderRadius: '20px', padding: 'clamp(24px, 4vw, 40px)' }}>
              {intro?.photo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={intro.photo_url} alt={intro.name} style={{ width: '100%', maxWidth: '300px', aspectRatio: '4/5', objectFit: 'cover', borderRadius: '16px', border: `2px solid ${P.accent}44` }} />
              ) : <div />}
              <div>
                <Eyebrow color={P.accent} line={P.accent}>Quién lo preparó</Eyebrow>
                <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.01em', color: P.ink }}>{intro?.name}</div>
                {intro?.title && <div style={{ fontSize: '13.5px', fontWeight: 600, color: P.accent, marginTop: '4px' }}>{intro.title}</div>}
                {intro?.paragraph && <p style={{ fontSize: '15px', color: P.textSoft, lineHeight: 1.7, margin: '16px 0 0' }}>{intro.paragraph}</p>}
                {intro?.quote && (
                  <blockquote style={{ fontSize: '15px', fontStyle: 'italic', color: P.textSoft, lineHeight: 1.6, margin: '18px 0 0', paddingLeft: '16px', borderLeft: `3px solid ${P.accent}` }}>
                    “{intro.quote}”
                  </blockquote>
                )}
                {(intro?.whatsapp_url || intro?.instagram_url) && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                    {intro?.whatsapp_url && <SocialLink href={intro.whatsapp_url} icon={<MessageCircle size={15} />} P={P}>WhatsApp</SocialLink>}
                    {intro?.instagram_url && <SocialLink href={intro.instagram_url} icon={<AtSign size={15} />} P={P}>Instagram</SocialLink>}
                  </div>
                )}
              </div>
            </m.div>
          </div>
        </section>
      )}

      {/* Testimonios */}
      {config.testimonials.length > 0 && (
        <section style={{ background: P.paperAlt }}>
          <div style={{ ...WRAP, paddingTop: '64px', paddingBottom: '64px' }}>
            <m.div {...rise} style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 40px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: P.accent, marginBottom: '12px' }}>Testimonios</div>
              {config.testimonials_title && <h2 style={{ ...DISPLAY, fontSize: 'clamp(24px, 3.6vw, 36px)', color: P.ink, margin: 0 }}>{config.testimonials_title}</h2>}
            </m.div>
            <div className="hpv-cards">
              {config.testimonials.map((t, i) => (
                <m.figure key={i} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }} style={{ margin: 0, background: P.paper, border: `1px solid ${P.line}`, borderRadius: '18px', overflow: 'hidden', boxShadow: P.cardShadow, display: 'flex', flexDirection: 'column' }}>
                  {t.photo_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.photo_url} alt={t.name} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                  )}
                  <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                    <span aria-hidden style={{ fontSize: '40px', lineHeight: 0.6, color: P.accent, fontFamily: 'Georgia, serif' }}>&ldquo;</span>
                    <blockquote style={{ margin: 0, fontSize: '14px', fontStyle: 'italic', color: P.textSoft, lineHeight: 1.7, flex: 1 }}>{t.quote}</blockquote>
                    <figcaption style={{ paddingTop: '12px', borderTop: `1px solid ${P.line}` }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: P.ink }}>{t.name}</div>
                      {t.location && <div style={{ fontSize: '12px', color: P.textFaint, marginTop: '2px' }}>{t.location}</div>}
                    </figcaption>
                  </div>
                </m.figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Formulario */}
      <section id="form" style={{ background: P.paper }}>
        <div style={{ ...WRAP, paddingTop: '64px', paddingBottom: '64px', maxWidth: '620px' }}>
          <m.div {...rise} style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: P.accent, marginBottom: '12px' }}>Descarga tu material</div>
            {config.form_title && <h2 style={{ ...DISPLAY, fontSize: 'clamp(24px, 3.6vw, 34px)', color: P.ink, margin: 0 }}>{config.form_title}</h2>}
            {config.form_subtitle && <p style={{ fontSize: '15px', color: P.textSoft, lineHeight: 1.6, margin: '12px auto 0', maxWidth: '460px' }}>{config.form_subtitle}</p>}
          </m.div>
          <m.div {...rise} transition={{ ...rise.transition, delay: 0.1 }} style={{ background: P.paper, border: `1px solid ${P.line}`, borderRadius: '20px', padding: 'clamp(24px, 4vw, 36px)', boxShadow: P.cardShadow }}>
            <HostedForm
              publicId={channel.public_id}
              channelType="lead_magnet"
              tenantSlug={tenant.slug}
              channelSlug={channel.slug}
              config={config}
              accent={P.accent}
              surface="light"
            />
            {config.microcopy && <p style={{ fontSize: '11.5px', color: P.textFaint, textAlign: 'center', margin: '14px 0 0' }}>{config.microcopy}</p>}
          </m.div>
        </div>
      </section>

      {/* CTA final */}
      {(config.final_cta_title || config.final_cta_paragraph) && (
        <section style={{ background: P.inkDeep, color: P.onDark }}>
          <div style={{ ...WRAP, paddingTop: '72px', paddingBottom: '72px', textAlign: 'center', maxWidth: '680px' }}>
            <m.div {...rise}>
              {config.final_cta_title && <h2 style={{ ...DISPLAY, fontSize: 'clamp(26px, 4vw, 40px)', color: P.onDark, margin: 0 }}>{config.final_cta_title}</h2>}
              {config.final_cta_paragraph && <p style={{ fontSize: '16px', color: P.onDarkSoft, lineHeight: 1.65, margin: '16px auto 0', maxWidth: '520px' }}>{config.final_cta_paragraph}</p>}
              <div style={{ marginTop: '28px' }}>
                <a href="#form" className="hpv-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: '9px', padding: '15px 32px', fontSize: '14px', fontWeight: 700, letterSpacing: '0.02em', background: P.accent, color: P.ink, borderRadius: '12px', textDecoration: 'none' }}>
                  {config.cta_label || 'Quiero el material'} <ArrowRight size={17} />
                </a>
              </div>
            </m.div>
          </div>
        </section>
      )}
    </main>
  )
}

function SocialLink({ href, icon, P, children }: { href: string; icon: React.ReactNode; P: Pal; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600, color: P.ink, textDecoration: 'none', padding: '8px 16px', border: `1px solid ${P.line}`, borderRadius: '999px', background: P.paper }}>
      <span style={{ color: P.accent, display: 'inline-flex' }}>{icon}</span>{children}
    </a>
  )
}

// Sección de beneficios/tarjetas — compartida por lead magnet y (opcional) split.
function BenefitsSection({ config, P }: { config: HostedPageConfig; P: Pal }) {
  return (
    <section style={{ background: P.paper }}>
      <div style={{ ...WRAP, paddingTop: '64px', paddingBottom: '24px' }}>
        {(config.benefits_title || config.benefits_subtitle) && (
          <m.div {...rise} style={{ textAlign: 'center', maxWidth: '680px', margin: '0 auto 40px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: P.accent, marginBottom: '12px' }}>Lo que contiene</div>
            {config.benefits_title && <h2 style={{ ...DISPLAY, fontSize: 'clamp(24px, 3.6vw, 36px)', color: P.ink, margin: 0 }}>{config.benefits_title}</h2>}
            {config.benefits_subtitle && <p style={{ fontSize: '15px', color: P.textSoft, lineHeight: 1.65, margin: '14px auto 0' }}>{config.benefits_subtitle}</p>}
          </m.div>
        )}
        <div className="hpv-cards">
          {config.benefits.map((b, i) => (
            <m.div key={i} {...rise} transition={{ ...rise.transition, delay: i * 0.07 }} style={{ background: P.paperAlt, border: `1px solid ${P.line}`, borderRadius: '16px', padding: '22px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', marginBottom: '14px', background: P.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: P.ink }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: P.ink, lineHeight: 1.35 }}>{b.title}</div>
              {b.desc && <div style={{ fontSize: '13.5px', color: P.textSoft, lineHeight: 1.6, marginTop: '8px' }}>{b.desc}</div>}
            </m.div>
          ))}
        </div>
      </div>
    </section>
  )
}
