import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { HeroStage } from '@/components/marketing/landing/hero-stage'
import { LeadCooling } from '@/components/marketing/landing/lead-cooling'
import { LeadJourney } from '@/components/marketing/landing/lead-journey'
import { PlatformPlan } from '@/components/marketing/landing/platform'
import { MarketScale } from '@/components/marketing/landing/market-scale'
import { DrawRule, StruckList } from '@/components/marketing/landing/struck-list'
import { ContactForm } from '@/components/marketing/contact-form'
import { PLANS, PLAN_ORDER, TRIAL } from '@/lib/plans'
import './landing.css'

// ─── Contenido ────────────────────────────────────────────────────────────────
// El copy de las secciones vive aquí arriba, no esparcido por el JSX (el de las
// escenas animadas vive junto a cada escena). Regla de la landing: beneficio y
// consecuencia para el agente inmobiliario — nunca el mecanismo interno. Nada
// de "scoring", "banda", "fit" ni nombres de campos.
//
// Página 100 % estática: no lee sesión ni base, así que sale entera en el
// shell prerenderizado del CDN. Las escenas son islas cliente.

const MORE_PROBLEMS = [
  {
    title: 'Las horas que no vuelven',
    body: 'Ordenar la planilla, recordar a quién le tocaba seguimiento, redactar el mismo correo por décima vez. Es media jornada por semana en la que no estuviste vendiendo.',
  },
  {
    title: 'El sistema que nadie abre',
    body: 'Lo contrataste, te entregaron cuarenta módulos y tres semanas de configuración. Tu equipo volvió al chat y a la libreta.',
  },
]

const ABSENT = [
  {
    title: 'Cuarenta módulos que nunca abres',
    body: 'No hay tickets de soporte, ni inventario de bodega, ni un constructor de flujos con doscientos bloques. Hay leads, propiedades, correos y números.',
  },
  {
    title: 'Tres semanas de configuración',
    body: 'No hay que diseñar el embudo ni inventar los campos. El sistema ya sabe cómo trabaja una inmobiliaria, porque no sabe hacer otra cosa.',
  },
  {
    title: 'Un consultor certificado',
    body: 'No necesitas contratar a nadie para implementarlo. Lo dejamos operando nosotros y tu equipo entra a usarlo.',
  },
  {
    title: 'Campos que no aplican a una casa',
    body: 'Nada de forzar un sistema genérico a punta de campos personalizados que después nadie llena.',
  },
]

const STEPS = [
  {
    title: 'Nos cuentas cómo trabajan hoy',
    body: 'Cuántos agentes son, de dónde llegan sus leads y qué se les escapa. Media hora de conversación.',
  },
  {
    title: 'Lo dejamos montado',
    body: 'Tus fuentes, tu equipo, tus secuencias y tu inventario, con tu marca. El trabajo de configuración es nuestro, no tuyo.',
  },
  {
    title: 'Tu equipo entra y vende',
    body: 'Abren la lista del día y empiezan a llamar. Sin tres sesiones de capacitación.',
  },
]

const ENTRY_PRICE = `$${PLANS.esencial.priceUsd}`
const TRIAL_PLAN = PLANS[TRIAL.plan].label

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* HERO — el mercado de noche y la lista del día */}
      <section className="mk-hero" aria-labelledby="mk-hero-title">
        <HeroStage>
          <h1 id="mk-hero-title" className="mk-display">
            Abre el CRM y ya sabes a quién llamar <span className="mk-gold">hoy</span>.
          </h1>
          <p className="mk-lead mk-hero-lead">
            La inteligencia artificial lee cada lead que entra, ordena tu lista del día
            y te dice qué decirle antes de levantar el teléfono. Captación, seguimiento,
            newsletters, open houses y propiedades, en un CRM hecho sólo para bienes raíces.
          </p>
          <div className="mk-hero-cta">
            <a href="#contacto" className="mk-btn-gold btn-cta">
              Empieza tu prueba de {TRIAL.days} días
            </a>
            <a href="#recorrido" className="mk-btn-ghost">
              Ver el recorrido
            </a>
          </div>
          <p className="mk-fineprint">
            Gratis · sin tarjeta de crédito · la experiencia {TRIAL_PLAN} completa
          </p>
        </HeroStage>
      </section>

      {/* EL PROBLEMA — la semana de un lead que nadie llamó */}
      <section id="problema" className="mk-container mk-section mk-problem">
        <h2 className="mk-h2 mk-problem-title">
          El dinero no se pierde en la negociación. Se pierde antes.
        </h2>
        <LeadCooling />
        <div className="mk-problem-more">
          {MORE_PROBLEMS.map(p => (
            <div key={p.title}>
              <h3 className="mk-h3">{p.title}</h3>
              <p className="mk-body" style={{ marginTop: '10px' }}>{p.body}</p>
            </div>
          ))}
        </div>
        <p className="mk-problem-close">
          Ninguno es un problema de esfuerzo. Es no saber, cada mañana, por dónde empezar.
        </p>
      </section>

      {/* EL RECORRIDO — de formulario a seguimiento */}
      <section id="recorrido" className="mk-band mk-section">
        <div className="mk-container">
          <header className="mk-section-head">
            <h2 className="mk-h2">Lo que pasa entre el formulario y la llamada</h2>
            <p className="mk-lead">
              Sin que nadie mueva tarjetas, ordene una planilla ni se acuerde de a quién
              le tocaba. Así recorre un lead tu operación.
            </p>
          </header>
          <LeadJourney />
        </div>
      </section>

      {/* LA PLATAFORMA — todo lo que trae */}
      <section id="plataforma" className="mk-container mk-section">
        <header className="mk-section-head">
          <h2 className="mk-h2">Captación, seguimiento, contenido y propiedades. Un solo lugar.</h2>
          <p className="mk-lead">
            Cada pieza habla con las demás: quien confirma un open house entra a tu
            lista, quien se suscribe a tu newsletter es un lead, la propiedad que cargas
            aparece en tu web.
          </p>
        </header>
        <PlatformPlan />
      </section>

      {/* TU MERCADO — la vara local */}
      <section id="mercado" className="mk-band mk-section">
        <div className="mk-container mk-market-layout">
          <div>
            <h2 className="mk-h2">Un presupuesto alto en Virginia no es un presupuesto alto en Madrid</h2>
            <p className="mk-lead" style={{ marginTop: '24px' }}>
              La mayoría de los sistemas traen una vara importada y miden a todos tus
              leads con ella. Aquí le dices cómo es tu mercado —en qué rangos se mueve,
              cuáles son tus zonas, cuánto vale para ti cerrar una operación— y califica
              con esa vara.
            </p>
            <p className="mk-body" style={{ marginTop: '16px' }}>
              Y cuando algo no lo sabemos, no lo inventamos: un dato que falta nunca se
              convierte en un punto en contra del lead.
            </p>
          </div>
          <MarketScale />
        </div>
      </section>

      {/* EL ENFOQUE — lo que no tiene */}
      <section id="enfoque" className="mk-container mk-section mk-focus">
        <header className="mk-focus-head">
          <h2 className="mk-h2">Hecho sólo para bienes raíces. Se nota en lo que no tiene.</h2>
          <p className="mk-lead">
            Casi todos los CRM del mercado sirven para vender cualquier cosa, y por eso
            hay que enseñarles el negocio. Este ya lo sabe.
          </p>
        </header>
        <StruckList items={ABSENT} />
      </section>

      {/* CÓMO EMPEZAMOS */}
      <section id="como-empezamos" className="mk-container mk-section mk-start">
        <h2 className="mk-h2" style={{ maxWidth: '760px' }}>
          De la primera conversación a estar operando, en días
        </h2>
        <div className="mk-steps">
          <DrawRule className="mk-steps-rule" />
          <ol className="mk-steps-list">
            {STEPS.map((s, i) => (
              <li key={s.title} className="mk-step">
                <span className="mk-step-n mk-num" aria-hidden>{i + 1}</span>
                <h3 className="mk-h3">{s.title}</h3>
                <p className="mk-body">{s.body}</p>
              </li>
            ))}
          </ol>
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
              Tres planes, según trabajes solo o con equipo. Todos traen lo mismo por
              dentro: la calificación de cada lead, el análisis con IA, las secuencias de
              correo y la newsletter. Lo que cambia es la capacidad y cuántos agentes
              tienen su propio acceso.
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
              Con la comisión de una sola operación cerrada, la inversión de un año entero
              queda cubierta.
            </p>
          </div>

          <aside className="mk-invest-trial" aria-label={`Prueba de ${TRIAL.days} días`}>
            <p className="mk-invest-trial-days">
              <span className="mk-num">{TRIAL.days}</span> días
            </p>
            <p className="mk-invest-trial-title">Pruébalo con tus propios leads, totalmente gratis.</p>
            <p className="mk-body" style={{ marginTop: '12px' }}>
              La experiencia {TRIAL_PLAN} completa, sin tarjeta de crédito y con la IA
              incluida de cortesía.
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

      {/* CONTACTO */}
      <section id="contacto" className="mk-section mk-contact-section">
        <div className="mk-container mk-contact">
          <div>
            <h2 className="mk-h2">Hablemos de tu operación</h2>
            <p className="mk-lead" style={{ marginTop: '20px', maxWidth: '440px' }}>
              Cuéntanos cómo trabaja tu equipo hoy y te mostramos, en una llamada, cómo se
              vería operando aquí.
            </p>
            <p className="mk-body" style={{ marginTop: '14px' }}>
              Respondemos en menos de 24 horas hábiles.
            </p>
          </div>
          <ContactForm />
        </div>
      </section>
    </>
  )
}
