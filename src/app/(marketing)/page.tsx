import {
  Gauge,
  LayoutDashboard,
  Mail,
  Home,
  BarChart3,
  Bell,
  PenLine,
  ListPlus,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { FadeIn, StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { HeroPipeline } from '@/components/marketing/hero-pipeline'
import { Reveal } from '@/components/marketing/reveal'
import { ContactForm } from '@/components/marketing/contact-form'
import { AuroraBackground } from '@/components/marketing/aurora-background'
import { Particles } from '@/components/marketing/particles'
import { PLANS, TRIAL } from '@/lib/plans'

// ─── Contenido ────────────────────────────────────────────────────────────────
// Todo el copy y los datos viven aquí arriba, no esparcidos por el JSX.

const STATS = [
  { value: '0–100', color: 'var(--accent-gold)',  label: 'puntaje por comportamiento real, con decaimiento por inactividad' },
  { value: '4',      color: 'var(--accent-blue)',  label: 'estados automáticos: el pipeline se ordena solo, sin mover tarjetas' },
  { value: '3',      color: 'var(--accent-coral)', label: 'idiomas con asignación automática de leads al agente correcto' },
  { value: '24/7',   color: 'var(--accent-teal)',  label: 'secuencias de nurturing en marcha mientras tu equipo vende' },
]

const FEATURES = [
  {
    icon: Gauge,
    glow: 'var(--accent-gold)',
    title: 'Scoring automático',
    body: 'Cada lead acumula puntos por señales reales: respuestas, clics, formularios, consultas agendadas. El tiempo sin actividad los reduce solo — nadie persigue leads fríos.',
  },
  {
    icon: LayoutDashboard,
    glow: 'var(--accent-blue)',
    title: 'Pipeline en tiempo real',
    body: 'Nuevo, nurturing, tibio, caliente: la banda de cada lead se deriva de su puntaje y cambia en vivo en el dashboard. Tu equipo abre la página y sabe a quién llamar primero.',
  },
  {
    icon: Mail,
    glow: 'var(--accent-teal)',
    title: 'Secuencias de email',
    body: 'Nurturing automático por canal y por agente, medido por clics y respuestas — no por aperturas infladas. Bajas, rebotes y quejas se bloquean solos.',
  },
  {
    icon: Home,
    glow: 'var(--accent-coral)',
    title: 'Propiedades sincronizadas',
    body: 'El inventario del CRM publica directo a tu sitio web: una sola carga, fotos optimizadas, control de qué se muestra al público.',
  },
  {
    icon: BarChart3,
    glow: 'var(--accent-pink)',
    title: 'Analytics por agente y canal',
    body: 'Qué canal trae leads que avanzan, qué agente convierte, cómo rinde cada secuencia. Decisiones sobre datos de tu operación, no intuición.',
  },
  {
    icon: Bell,
    glow: 'var(--accent-green)',
    title: 'Notificaciones al instante',
    body: 'Cuando un lead cruza los 80 puntos o llega una pregunta del formulario web, tu equipo lo sabe en segundos — campana en la app y aviso directo por Telegram.',
  },
]

const AI_FEATURES = [
  {
    icon: PenLine,
    glow: 'var(--accent-gold)',
    title: 'Emails redactados por IA',
    body: 'El composer escribe correos con la voz y la firma de cada agente: cartas personales, no plantillas de marketing. Tú revisas y envías.',
  },
  {
    icon: ListPlus,
    glow: 'var(--accent-blue)',
    title: 'Secuencias en un clic',
    body: 'Una secuencia de nurturing de 3 pasos generada desde cero para cada canal de adquisición, alineada al tono de tu equipo, lista para editar.',
  },
  {
    icon: FileText,
    glow: 'var(--accent-coral)',
    title: 'Propiedades desde un PDF',
    body: 'Sube la ficha del listing y el formulario se completa solo: descripción bilingüe, características, datos del inmueble. Tu equipo solo revisa y publica.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Contáctanos',
    body: 'Cuéntanos cómo opera tu equipo hoy: cuántos agentes, de dónde llegan los leads, qué se pierde en el camino.',
  },
  {
    n: '2',
    title: 'Configuramos tu infraestructura',
    body: 'Canales de adquisición, agentes, scoring, secuencias y tu inventario de propiedades — todo queda operando sin trabajo de tu lado.',
  },
  {
    n: '3',
    title: 'Opera desde tu dashboard',
    body: 'Tu pipeline vivo, tus métricas por agente y las notificaciones de leads calientes. Tu equipo se enfoca en cerrar.',
  },
]

// Precios/labels desde la fuente única (src/lib/plans.ts); los bullets son el
// copy de marketing de cada plan y viven aquí. El detalle completo va en /planes.
const PLAN_CARDS: {
  name: string
  price: string
  pricePrefix?: string
  period: string
  tagline: string
  features: string[]
  highlighted: boolean
}[] = [
  {
    name: PLANS.esencial.label,
    price: '$59',
    period: '/ mes',
    tagline: 'Para el agente independiente que empieza a ordenar su operación.',
    features: [
      'CRM completo con pipeline y scoring automático',
      'Secuencias de email con redacción por IA',
      'Hasta 2,500 leads y 3,000 emails al mes',
      'Canales de adquisición y notificaciones (app + Telegram)',
      'Soporte por email',
    ],
    highlighted: PLANS.esencial.highlighted,
  },
  {
    name: PLANS.growth.label,
    price: '$129',
    period: '/ mes',
    tagline: 'El independiente pro: toda la IA y tu web alimentada por el CRM.',
    features: [
      'Todo lo de Esencial, con más capacidad',
      'IA completa: emails, secuencias y alta de propiedades desde PDF',
      'Dominio de envío propio (mail.tudominio.com), gestionado por nosotros',
      'Propiedades sincronizadas con tu sitio web',
      'Analytics completo por agente, canal y email',
      'Hasta 10,000 leads y 15,000 emails al mes',
      'Onboarding asistido',
    ],
    highlighted: PLANS.growth.highlighted,
  },
  {
    name: PLANS.partner.label,
    price: '$249',
    pricePrefix: 'desde',
    period: '/ mes',
    tagline: 'Para equipos y grupos inmobiliarios: 2 o más agentes con acceso propio.',
    features: [
      'Todo lo de Growth, sin límites',
      'Acceso propio para cada agente — cada quien ve sus leads',
      'Leads y propiedades ilimitados · 50,000 emails al mes',
      'Analytics con vista de equipo',
      'Onboarding dedicado y migración de datos (HubSpot y otros)',
      'Soporte prioritario con contacto directo',
    ],
    highlighted: PLANS.partner.highlighted,
  },
]

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <AuroraBackground />
        <Particles />
        <div className="mk-container mk-hero" style={{ position: 'relative' }}>
          <div>
            <FadeIn y={10}>
              <span className="mk-eyebrow">Growth Partner Platform · con IA integrada</span>
            </FadeIn>
            <FadeIn y={14} delay={0.08}>
              <h1 className="mk-h1" style={{ marginTop: '18px' }}>
                El CRM con <span className="mk-gradient-text">IA</span> que tu
                equipo inmobiliario necesita
              </h1>
            </FadeIn>
            <FadeIn y={14} delay={0.16}>
              <p className="mk-lead" style={{ marginTop: '22px', maxWidth: '480px' }}>
                Scoring automático, secuencias que se redactan solas y un pipeline
                que se ordena en tiempo real — la infraestructura que antes solo
                tenían los equipos más grandes, ahora al alcance del tuyo.
              </p>
            </FadeIn>
            <FadeIn y={14} delay={0.24}>
              <div style={{ display: 'flex', gap: '12px', marginTop: '32px', flexWrap: 'wrap' }}>
                <a href="#contacto" className="mk-btn-gold btn-cta">Prueba {TRIAL.days} días gratis</a>
                <a href="#producto" className="mk-btn-ghost">Ver el producto</a>
              </div>
              <p style={{ marginTop: '14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>100% gratis</strong>
                {' '}· sin tarjeta de crédito · experiencia {PLANS[TRIAL.plan].label} completa
              </p>
            </FadeIn>
          </div>
          <FadeIn y={20} delay={0.2}>
            <HeroPipeline />
          </FadeIn>
        </div>
      </section>

      {/* MÉTRICAS */}
      <section className="mk-container mk-section-tight">
        <Reveal>
          <div className="mk-stats">
            {STATS.map(s => (
              <div key={s.value} className="mk-stat">
                <div
                  className="mk-num"
                  style={{ fontSize: '30px', fontWeight: 500, letterSpacing: '-0.02em', color: s.color }}
                >
                  {s.value}
                </div>
                <p style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)', marginTop: '8px' }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* PRODUCTO */}
      <section id="producto" className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Producto</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '560px' }}>
            Un CRM que prioriza por ti
          </h2>
          <p className="mk-body" style={{ marginTop: '14px', maxWidth: '560px' }}>
            La mayoría de los CRM son una lista de contactos que alguien tiene que
            mantener. ITMANO es un sistema operativo: los leads entran por tus
            canales, se califican por su comportamiento y llegan a tu equipo ya
            priorizados.
          </p>
        </Reveal>
        <div style={{ marginTop: '40px' }}>
          <StaggerGroup className="mk-grid-3" stagger={0.06}>
            {FEATURES.map(f => (
              <StaggerItem key={f.title}>
                <div
                  className="mk-card mk-feature-card"
                  style={{ height: '100%', ['--glow-color' as string]: f.glow }}
                >
                  <div className="mk-icon-badge">
                    <f.icon size={19} strokeWidth={1.5} aria-hidden />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '14px' }}>
                    {f.title}
                  </h3>
                  <p className="mk-body" style={{ fontSize: '13px', marginTop: '8px' }}>{f.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* IA */}
      <section id="ia" style={{ position: 'relative', backgroundColor: 'var(--bg-surface)', overflow: 'hidden', scrollMarginTop: '72px' }}>
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <div className="mk-divider-gradient" style={{ position: 'absolute', bottom: 0 }} />
        <AuroraBackground style={{ opacity: 0.6 }} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <Reveal>
            <span className="mk-eyebrow">Inteligencia artificial</span>
            <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '560px' }}>
              <span className="mk-gradient-text">IA</span> integrada donde ahorra horas, no donde estorba
            </h2>
            <p className="mk-body" style={{ marginTop: '14px', maxWidth: '560px' }}>
              Nada de chatbots genéricos. La IA de ITMANO trabaja dentro del flujo de
              tu equipo — redacta, genera y captura — y una persona siempre revisa
              antes de que algo salga al mundo.
            </p>
          </Reveal>
          <div style={{ marginTop: '40px' }}>
            <StaggerGroup className="mk-grid-3" stagger={0.08}>
              {AI_FEATURES.map(f => (
                <StaggerItem key={f.title}>
                  <div
                    className="mk-card mk-feature-card"
                    style={{
                      height: '100%',
                      backgroundColor: 'var(--bg-elevated)',
                      borderTop: '1px solid var(--border-accent)',
                      ['--glow-color' as string]: f.glow,
                    }}
                  >
                    <div className="mk-icon-badge">
                      <f.icon size={19} strokeWidth={1.5} aria-hidden />
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '14px' }}>
                      {f.title}
                    </h3>
                    <p className="mk-body" style={{ fontSize: '13px', marginTop: '8px' }}>{f.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Cómo funciona</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '560px' }}>
            De la primera llamada a operar, en días
          </h2>
        </Reveal>
        <div style={{ marginTop: '40px' }}>
          <StaggerGroup className="mk-steps" stagger={0.08}>
            {STEPS.map(s => (
              <StaggerItem key={s.n}>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', height: '100%' }}>
                  <span className="mk-num" style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 600 }}>
                    {s.n}
                  </span>
                  <h3 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '10px' }}>
                    {s.title}
                  </h3>
                  <p className="mk-body" style={{ fontSize: '13px', marginTop: '8px', maxWidth: '320px' }}>{s.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* INVERSIÓN */}
      <section id="inversion" className="mk-container mk-section" style={{ paddingTop: '48px' }}>
        <Reveal>
          <span className="mk-eyebrow">Inversión</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '560px' }}>
            Una inversión, toda la infraestructura
          </h2>
          <p className="mk-body" style={{ marginTop: '14px', maxWidth: '560px' }}>
            Las cuentas se crean con nuestro equipo — así tu operación queda
            configurada y funcionando desde el primer día, no un software vacío.
          </p>
          {/* Banner del período de prueba — el gancho de adquisición */}
          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid var(--border-accent)',
              backgroundImage:
                'linear-gradient(100deg, color-mix(in srgb, var(--accent-gold) 10%, transparent), color-mix(in srgb, var(--accent-coral) 6%, transparent) 60%, color-mix(in srgb, var(--accent-blue) 8%, transparent))',
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 600 }}>
                Prueba ITMANO {TRIAL.days} días — <span className="mk-gradient-text">totalmente gratis</span>
              </strong>
              {' '}· la experiencia {PLANS[TRIAL.plan].label} completa, sin tarjeta de crédito
              y con presupuesto de IA de cortesía incluido.
            </p>
            <a href="#contacto" className="mk-btn-gold btn-cta" style={{ padding: '10px 20px' }}>
              Prueba {TRIAL.days} días gratis
            </a>
          </div>
        </Reveal>
        <div style={{ marginTop: '40px' }}>
          <StaggerGroup className="mk-pricing" stagger={0.08}>
            {PLAN_CARDS.map(p => (
              <StaggerItem key={p.name}>
                <div
                  className="mk-card"
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '28px',
                    ...(p.highlighted
                      ? {
                          border: '1px solid var(--border-gold-hover)',
                          backgroundImage:
                            'radial-gradient(circle at 25% -10%, color-mix(in srgb, var(--accent-gold) 14%, transparent), transparent 55%)',
                          backgroundColor: 'var(--bg-elevated)',
                          boxShadow: 'var(--highlight-top), var(--shadow-lg)',
                        }
                      : {}),
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      className={p.highlighted ? 'mk-gradient-text' : undefined}
                      style={{
                        fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: p.highlighted ? undefined : 'var(--text-secondary)',
                      }}
                    >
                      {p.name}
                    </span>
                    {p.highlighted && (
                      <span style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-gold)', border: '1px solid var(--border-accent)', borderRadius: '4px', padding: '3px 8px' }}>
                        Más elegido
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '18px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    {p.pricePrefix && (
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{p.pricePrefix}</span>
                    )}
                    <span className="mk-num" style={{ fontSize: '38px', fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                      {p.price}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{p.period}</span>
                  </div>
                  <p className="mk-body" style={{ fontSize: '13px', marginTop: '10px' }}>{p.tagline}</p>
                  <ul style={{ listStyle: 'none', marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ display: 'flex', gap: '10px', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                        <span aria-hidden style={{ color: 'var(--accent-gold)', flexShrink: 0, marginTop: '1px' }}>·</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#contacto"
                    className={p.highlighted ? 'mk-btn-gold btn-cta' : 'mk-btn-ghost'}
                    style={{ marginTop: '26px', width: '100%' }}
                  >
                    Contáctanos
                  </a>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
        <Reveal>
          <p style={{ marginTop: '28px', textAlign: 'center' }}>
            <Link
              href="/planes"
              style={{ fontSize: '14px', color: 'var(--accent-gold)', textDecoration: 'none' }}
            >
              Compara los planes en detalle — y contra el resto del mercado →
            </Link>
          </p>
        </Reveal>
      </section>

      {/* CONTACTO */}
      <section id="contacto" style={{ position: 'relative', backgroundColor: 'var(--bg-surface)', overflow: 'hidden', scrollMarginTop: '72px' }}>
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <AuroraBackground style={{ opacity: 0.45 }} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <div className="mk-contact">
            <Reveal>
              <span className="mk-eyebrow">Contacto</span>
              <h2 className="mk-h2" style={{ marginTop: '14px' }}>
                Hablemos de tu operación
              </h2>
              <p className="mk-body" style={{ marginTop: '14px', maxWidth: '400px' }}>
                Cuéntanos cómo trabaja tu equipo y te mostraremos, con una
                demostración en vivo, cómo se vería operando sobre ITMANO.
                Respondemos en menos de 24 horas hábiles.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <ContactForm />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
