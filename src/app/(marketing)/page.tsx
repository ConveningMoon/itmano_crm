import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { LiveCRM } from '@/components/marketing/landing/live-crm'
import { LeadFile } from '@/components/marketing/landing/lead-file'
import { FollowUp } from '@/components/marketing/landing/follow-up'
import { PropertyWeb } from '@/components/marketing/landing/property-web'
import { NewsletterEdition } from '@/components/marketing/landing/newsletter-edition'
import { QualityMarket } from '@/components/marketing/landing/quality-market'
import { MoreGrid } from '@/components/marketing/landing/more-grid'
import { StruckList } from '@/components/marketing/landing/struck-list'
import { ContactForm } from '@/components/marketing/contact-form'
import { PLANS, PLAN_ORDER, TRIAL } from '@/lib/plans'
import './landing.css'

// ─── Contenido ────────────────────────────────────────────────────────────────
// La página se arma con el producto: cada sección muestra una pantalla del CRM
// (réplicas con datos ficticios, con el vocabulario y los colores reales de
// src/lib/scoring/priority.ts). El copy va corto y concreto: beneficio y
// consecuencia para el agente, nunca el mecanismo interno.
//
// Página 100 % estática: no lee sesión ni base, así que sale entera en el
// shell prerenderizado del CDN. Las escenas son islas cliente.

const WITHOUT = [
  { title: 'cuarenta módulos que nunca abres' },
  { title: 'tres semanas de configuración' },
  { title: 'un consultor certificado' },
  { title: 'campos que no aplican a una casa' },
]

const STEPS = [
  { title: 'Nos cuentas cómo trabajan hoy', body: 'Cuántos agentes son, de dónde llegan sus leads y qué se les escapa. Media hora.' },
  { title: 'Lo dejamos montado', body: 'Tus fuentes, tu equipo, tus secuencias y tu inventario, con tu marca. La configuración es trabajo nuestro.' },
  { title: 'Tu equipo entra y vende', body: 'Abren la cola del día y empiezan a llamar. Sin tres sesiones de capacitación.' },
]

const ENTRY_PRICE = `$${PLANS.esencial.priceUsd}`
const TRIAL_PLAN = PLANS[TRIAL.plan].label

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* HERO — el CRM funcionando, sobre una casa de noche */}
      <section className="lp-hero" aria-labelledby="lp-hero-title">
        <div className="lp-hero-photo" aria-hidden>
          <Image src="/landing/casa-noche.webp" alt="" fill priority sizes="100vw" />
        </div>
        <div className="lp-hero-veil" aria-hidden />
        <div className="mk-container lp-hero-inner">
          <div className="lp-hero-head">
            <h1 id="lp-hero-title" className="mk-display">
              Abre el CRM y ya sabes a quién llamar <span className="mk-gold">hoy</span>.
            </h1>
            <div className="lp-hero-side">
              <p className="mk-lead">
                El CRM inmobiliario con IA que lee cada lead que entra, lo ubica en tu cola del día
                y te dice qué decirle. Captación, seguimiento, propiedades y newsletters, con tu marca.
              </p>
              <div className="lp-cta">
                <a href="#contacto" className="mk-btn-gold btn-cta">
                  Empieza tu prueba de {TRIAL.days} días
                </a>
                <Link href="/planes" className="mk-btn-ghost">
                  Ver planes
                </Link>
              </div>
              <p className="lp-fine">Gratis · sin tarjeta · la experiencia {TRIAL_PLAN} completa</p>
            </div>
          </div>
          <LiveCRM />
          <p className="lp-hint">Demostración con datos ficticios: toca un lead de la cola o cambia de vista en el menú.</p>
        </div>
      </section>

      {/* HECHO SÓLO PARA BIENES RAÍCES */}
      <section className="lp-without" aria-label="Lo que no vas a encontrar">
        <div className="mk-container lp-without-inner">
          <p className="lp-without-lead">Hecho sólo para bienes raíces. Sin</p>
          <StruckList items={WITHOUT} compact />
          <p className="lp-without-close">Hay leads, propiedades, correos y números.</p>
        </div>
      </section>

      {/* LA IA DE CERCA */}
      <section id="ia" className="mk-container mk-section">
        <header className="lp-head">
          <h2 className="mk-h2">La IA lee cada lead antes que tú.</h2>
          <p className="mk-lead">
            Abres la ficha y está todo lo que necesitas para llamar: su lugar en tu cartera, lo que
            suma, lo que resta y qué decirle. Viene encendida desde el primer día, en todos los planes.
          </p>
        </header>
        <LeadFile />
      </section>

      {/* SEGUIMIENTO */}
      <section id="seguimiento" className="mk-band mk-section">
        <div className="mk-container">
          <header className="lp-head">
            <h2 className="mk-h2">El seguimiento sale solo, con tu firma y en su idioma.</h2>
            <p className="mk-lead">
              Secuencias que se activan con un formulario o con una etiqueta, firmadas por el agente
              que atiende a cada lead, en español, inglés o portugués. Las bajas y los rebotes se
              respetan solos.
            </p>
          </header>
          <FollowUp />
        </div>
      </section>

      {/* PROPIEDADES → TU WEB */}
      <section id="propiedades" className="mk-container mk-section">
        <header className="lp-head">
          <h2 className="mk-h2">La cargas una vez. Aparece en tu web, con su open house.</h2>
          <p className="mk-lead">
            La IA arma la ficha desde el PDF del listado y tú decides qué se publica. El open house
            trae su cuenta regresiva y la confirmación con un clic; quien confirma entra a tu CRM.
          </p>
        </header>
        <PropertyWeb />
      </section>

      {/* NEWSLETTER */}
      <section id="newsletter" className="mk-band mk-section">
        <div className="mk-container">
          <header className="lp-head">
            <h2 className="mk-h2">Una newsletter de tu mercado, escrita con IA y firmada por ti.</h2>
            <p className="mk-lead">Incluida en los tres planes. Cada edición trabaja de captación: quien se suscribe, entra a tu cartera.</p>
          </header>
          <NewsletterEdition />
        </div>
      </section>

      {/* LA VARA DE TU MERCADO */}
      <section id="mercado" className="mk-container mk-section">
        <header className="lp-head">
          <h2 className="mk-h2">Calidad medida con la vara de tu mercado.</h2>
          <p className="mk-lead">
            Un presupuesto alto en Virginia no lo es en Madrid. Le dices al CRM en qué rangos se mueve
            tu mercado, cuáles son tus zonas y cuánto vale cerrar una operación, y califica con esa
            vara. Un dato que falta nunca cuenta en contra.
          </p>
        </header>
        <QualityMarket />
      </section>

      {/* Y ADEMÁS */}
      <section id="plataforma" className="mk-band mk-section">
        <div className="mk-container">
          <header className="lp-head">
            <h2 className="mk-h2">Y lo demás que pide una operación inmobiliaria.</h2>
          </header>
          <MoreGrid />
        </div>
      </section>

      {/* INVERSIÓN — el único campo de oro de la página */}
      <section id="inversion" className="mk-invest">
        <div className="mk-container mk-invest-grid">
          <div>
            <h2 className="mk-invest-title">
              Desde <span className="mk-num">{ENTRY_PRICE}</span> al&nbsp;mes
            </h2>
            <p className="mk-invest-text">
              Tres planes, según trabajes solo o con equipo. Todos traen lo mismo por dentro: la
              calificación de cada lead, el análisis con IA, las secuencias de correo y la newsletter.
              Cambia la capacidad y cuántos agentes tienen su propio acceso.
            </p>
            <ul className="mk-invest-plans">
              {PLAN_ORDER.map(key => {
                const plan = PLANS[key]
                return (
                  <li key={key} className="mk-invest-plan">
                    <span className="mk-invest-plan-name">
                      {plan.label}
                      {plan.highlighted && <span className="mk-invest-plan-tag">Recomendado</span>}
                    </span>
                    <span className="mk-invest-plan-who">{plan.audience}</span>
                    <span className="mk-invest-plan-price mk-num">{plan.inversion}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mk-invest-text" style={{ marginTop: '28px' }}>
              Con la comisión de una sola operación cerrada, la inversión de un año entero queda cubierta.
            </p>
          </div>

          <aside className="mk-invest-trial" aria-label={`Prueba de ${TRIAL.days} días`}>
            <p className="mk-invest-trial-days">
              <span className="mk-num">{TRIAL.days}</span> días
            </p>
            <p className="mk-invest-trial-title">Pruébalo con tus propios leads, totalmente gratis.</p>
            <p className="mk-body" style={{ marginTop: '12px' }}>
              La experiencia {TRIAL_PLAN} completa, sin tarjeta de crédito y con la IA incluida de cortesía.
            </p>
            <a href="#contacto" className="mk-btn-gold btn-cta" style={{ marginTop: '28px', width: '100%' }}>
              Empieza tu prueba
            </a>
            <Link href="/planes" className="mk-invest-link">
              Compara los planes en detalle, y contra el resto del mercado
              <ArrowRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          </aside>
        </div>
      </section>

      {/* CÓMO EMPEZAMOS + CONTACTO */}
      <section id="contacto" className="mk-section lp-contact">
        <div className="mk-container">
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step-n mk-num" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mk-h3">{s.title}</h3>
                <p className="mk-body">{s.body}</p>
              </li>
            ))}
          </ol>

          <div className="lp-contact-grid">
            <div>
              <h2 className="mk-h2">Hablemos de tu operación</h2>
              <p className="mk-lead" style={{ marginTop: '20px', maxWidth: '440px' }}>
                Cuéntanos cómo trabaja tu equipo hoy y te mostramos, en una llamada, cómo se vería
                operando aquí. Respondemos en menos de 24 horas hábiles.
              </p>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  )
}
