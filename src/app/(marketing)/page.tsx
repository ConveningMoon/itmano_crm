import { Eye, Target, MessageSquare, ShieldAlert, Inbox, Mail, Bell, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { FadeIn } from '@/components/motion/primitives'
import { HeroVideo } from '@/components/marketing/hero-video'
import { BriefingCard } from '@/components/marketing/briefing-card'
import { Reveal } from '@/components/marketing/reveal'
import { ContactForm } from '@/components/marketing/contact-form'
import { Backdrop } from '@/components/marketing/backdrop'
import { PLANS, TRIAL } from '@/lib/plans'

// ─── Contenido ────────────────────────────────────────────────────────────────
// Todo el copy vive aquí arriba, no esparcido por el JSX. Regla de la landing:
// beneficio y consecuencia para el agente inmobiliario — nunca el mecanismo
// interno. Nada de "scoring", "banda", "fit" ni nombres de campos.

const PROBLEMS = [
  {
    title: 'El lead que escribió el martes',
    body: 'Llegó a las nueve de la noche, entre otros doce. Alguien lo llamó el viernes. Para entonces ya había hablado con otro agente.',
  },
  {
    title: 'Las horas que no vuelven',
    body: 'Ordenar la planilla, recordar a quién le tocaba seguimiento, redactar el mismo correo por décima vez. Es media jornada por semana en la que no estuviste vendiendo.',
  },
  {
    title: 'El sistema que nadie abre',
    body: 'Lo contrataste, te entregaron cuarenta módulos y tres semanas de configuración. Tu equipo volvió al chat y a la libreta.',
  },
]

const BRIEFING_POINTS = [
  {
    icon: Eye,
    glow: 'var(--accent-gold)',
    title: 'Quién es de verdad',
    body: 'Su motivación real, su urgencia y el obstáculo que todavía no dijo en voz alta.',
  },
  {
    icon: Target,
    glow: 'var(--accent-blue)',
    title: 'Qué hacer ahora',
    body: 'Una sola acción, con verbo: llamar, escribir, agendar o esperar. Y si es para hoy o puede esperar a la semana.',
  },
  {
    icon: MessageSquare,
    glow: 'var(--accent-teal)',
    title: 'Qué decirle',
    body: 'Dos o tres puntos concretos para esa conversación, anclados a lo que el lead acaba de hacer.',
  },
  {
    icon: ShieldAlert,
    glow: 'var(--accent-coral)',
    title: 'Qué objeción anticipar',
    body: 'Si ya trabaja con otro agente, si su presupuesto no alcanza para lo que busca, si quien decide es otra persona.',
  },
]

const OPERATION = [
  {
    icon: Inbox,
    glow: 'var(--accent-blue)',
    title: 'Todo lo que captas, en un solo lugar',
    body: 'Tus páginas de captura, tus guías descargables, tus eventos y los formularios de tu web entran directo, ya identificados por dónde llegaron. Sin copiar y pegar, sin exportar nada.',
  },
  {
    icon: Mail,
    glow: 'var(--accent-teal)',
    title: 'El correo que siempre ibas a mandar',
    body: 'Secuencias que salen solas, con tu tono y con la firma del agente que atiende. Las bajas y los rebotes se manejan solos: nadie recibe un correo que no debería recibir.',
  },
  {
    icon: Bell,
    glow: 'var(--accent-coral)',
    title: 'El aviso llega antes que la competencia',
    body: 'Cuando un lead se pone caliente lo sabes en segundos, en la aplicación y en tu teléfono. No hace falta que nadie esté mirando la pantalla.',
  },
  {
    icon: BarChart3,
    glow: 'var(--accent-pink)',
    title: 'Sabes qué fuente vale la pena',
    body: 'Cuál de tus canales trae gente que avanza y cuál sólo trae volumen — con lo que de verdad pasó después, no con lo que prometió la campaña.',
  },
]

const ABSENT = [
  {
    title: 'Cuarenta módulos que nunca abres',
    body: 'No hay tickets de soporte, ni inventario de bodega, ni un constructor de flujos con doscientos bloques. Hay leads, propiedades, correos y números. Nada más.',
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
    n: '1',
    title: 'Nos cuentas cómo trabajan hoy',
    body: 'Cuántos agentes son, de dónde llegan sus leads y qué se les escapa. Media hora de conversación.',
  },
  {
    n: '2',
    title: 'Lo dejamos montado',
    body: 'Tus fuentes, tu equipo, tus secuencias y tu inventario, con tu marca. El trabajo de configuración es nuestro, no tuyo.',
  },
  {
    n: '3',
    title: 'Tu equipo entra y vende',
    body: 'Abren la lista del día y empiezan a llamar. Sin tres sesiones de capacitación.',
  },
]

const ENTRY_PRICE = `$${PLANS.esencial.priceUsd}`

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* HERO */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <Backdrop />
        <div className="mk-container mk-hero" style={{ position: 'relative' }}>
          <FadeIn y={10}>
            <span className="mk-eyebrow">CRM inmobiliario con inteligencia artificial</span>
          </FadeIn>
          <FadeIn y={14} delay={0.08}>
            <h1 className="mk-h1" style={{ marginTop: '20px' }}>
              Abre el CRM y ya sabes a quién llamar <span className="mk-gradient-text">hoy</span>
            </h1>
          </FadeIn>
          <FadeIn y={14} delay={0.16}>
            <p className="mk-lead" style={{ marginTop: '22px', maxWidth: '620px' }}>
              La inteligencia artificial lee cada lead que entra, ordena tu lista del
              día y te dice qué decirle a cada uno antes de levantar el teléfono.
              Hecho sólo para bienes raíces: sin módulos que nunca abres, sin semanas
              de configuración.
            </p>
          </FadeIn>
          <FadeIn y={14} delay={0.24}>
            <div className="mk-hero-cta">
              <a href="#contacto" className="mk-btn-gold btn-cta">
                Empieza tu prueba de {TRIAL.days} días
              </a>
              <a href="#producto" className="mk-btn-ghost">Ver cómo funciona</a>
            </div>
            <p className="mk-fineprint">
              Totalmente gratis · sin tarjeta de crédito · la experiencia{' '}
              {PLANS[TRIAL.plan].label} completa
            </p>
          </FadeIn>
          <FadeIn y={18} delay={0.32}>
            <div className="mk-hero-video">
              <HeroVideo />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* EL PROBLEMA */}
      <section className="mk-container mk-section-tight">
        <Reveal>
          <span className="mk-eyebrow">Lo que cuesta no tenerlo</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '620px' }}>
            El dinero no se pierde en la negociación. Se pierde antes.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="mk-problems">
            {PROBLEMS.map(p => (
              <div key={p.title} className="mk-problem">
                <h3 className="mk-item-title">{p.title}</h3>
                <p className="mk-body" style={{ fontSize: '13px', marginTop: '10px' }}>{p.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mk-body" style={{ marginTop: '32px', maxWidth: '620px' }}>
            Ninguno de los tres es un problema de esfuerzo. Es un problema de no
            saber, cada mañana, por dónde empezar.
          </p>
        </Reveal>
      </section>

      {/* LA LISTA DEL DÍA */}
      <section id="producto" className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Cómo se siente usarlo</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '660px' }}>
            Nadie decide a quién llamar. La lista ya viene decidida.
          </h2>
          <div className="mk-prose">
            <p className="mk-lead">
              Cada lead que entra se califica solo: con lo que respondió al llegar y
              con lo que hace después — si contestó tu correo, si volvió a tu web, si
              pidió una valoración. Tu equipo abre el CRM en la mañana y encuentra la
              lista del día ya ordenada. Arriba, quien está más cerca de firmar.
            </p>
            <p className="mk-body">
              Nadie tiene que mantener la lista al día, ni mover tarjetas para que las
              cuentas cuadren, ni acordarse de a quién le tocaba seguimiento. El
              trabajo de decidir el orden ya está hecho cuando tu agente se sienta.
            </p>
          </div>
        </Reveal>
      </section>

      {/* IA */}
      <section id="ia" className="mk-band">
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <div className="mk-divider-gradient" style={{ position: 'absolute', bottom: 0 }} />
        <Backdrop intensity={0.55} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <Reveal>
            <span className="mk-eyebrow">Inteligencia artificial</span>
            <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '660px' }}>
              La IA lee cada lead <span className="mk-gradient-text">antes</span> que tú
            </h2>
            <p className="mk-lead" style={{ marginTop: '18px', maxWidth: '620px' }}>
              Lo que tu agente encuentra al abrir un lead no es una ficha con campos.
              Es lo que un buen director de ventas le diría en diez segundos antes de
              levantar el teléfono.
            </p>
          </Reveal>

          <div className="mk-ia-layout">
            <Reveal delay={0.06}>
              <div className="mk-ia-points">
                {BRIEFING_POINTS.map(f => (
                  <div key={f.title} className="mk-point" style={{ ['--glow-color' as string]: f.glow }}>
                    <div className="mk-icon-badge">
                      <f.icon size={18} strokeWidth={1.5} aria-hidden />
                    </div>
                    <div>
                      <h3 className="mk-item-title">{f.title}</h3>
                      <p className="mk-body" style={{ fontSize: '13px', marginTop: '6px' }}>{f.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <BriefingCard />
            </Reveal>
          </div>

          <Reveal delay={0.08}>
            <p className="mk-body" style={{ marginTop: '36px', maxWidth: '620px' }}>
              Viene encendido desde el primer día, en todos los planes. No hay nada
              que configurar ni nada que activar.
            </p>
          </Reveal>
        </div>
      </section>

      {/* TU MERCADO */}
      <section className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Tu mercado</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '700px' }}>
            Un presupuesto alto en Virginia no es un presupuesto alto en Barcelona
          </h2>
          <div className="mk-prose">
            <p className="mk-lead">
              La mayoría de los sistemas traen una vara importada y miden a todos tus
              leads con ella. Aquí le dices cómo es tu mercado — en qué rangos se
              mueve, cuáles son tus zonas, cuánto vale para ti cerrar una operación —
              y califica con esa vara. Un lead que en otra ciudad sería marginal, en
              la tuya puede ser el mejor de la semana.
            </p>
            <p className="mk-body">
              Y cuando algo no lo sabemos, no lo inventamos: un dato que falta nunca
              se convierte en un punto en contra del lead.
            </p>
          </div>
        </Reveal>
      </section>

      {/* CAPTACIÓN Y SEGUIMIENTO */}
      <section className="mk-band">
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <Reveal>
            <span className="mk-eyebrow">Captación y seguimiento</span>
            <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '660px' }}>
              Los leads entran solos. El seguimiento no se te olvida.
            </h2>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="mk-grid-2">
              {OPERATION.map(f => (
                <div
                  key={f.title}
                  className="mk-card mk-feature-card"
                  style={{ height: '100%', backgroundColor: 'var(--bg-elevated)', ['--glow-color' as string]: f.glow }}
                >
                  <div className="mk-icon-badge">
                    <f.icon size={19} strokeWidth={1.5} aria-hidden />
                  </div>
                  <h3 className="mk-item-title" style={{ marginTop: '14px' }}>{f.title}</h3>
                  <p className="mk-body" style={{ fontSize: '13px', marginTop: '8px' }}>{f.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* PROPIEDADES */}
      <section className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Propiedades</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '620px' }}>
            La cargas una vez. Aparece en tu sitio web.
          </h2>
          <div className="mk-prose">
            <p className="mk-lead">
              Tu inventario vive en el CRM y alimenta tu página pública: fotos,
              descripción, disponibilidad. Tú decides qué se muestra al público y qué
              se queda adentro para el equipo.
            </p>
            <p className="mk-body">
              Todo lleva tu marca: tu logo, tus colores, tu dominio. En ningún lugar
              donde mire tu cliente dice ITMANO.
            </p>
          </div>
        </Reveal>
      </section>

      {/* EL ENFOQUE */}
      <section id="enfoque" className="mk-band">
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <Backdrop intensity={0.5} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <Reveal>
            <span className="mk-eyebrow">El enfoque</span>
            <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '660px' }}>
              Hecho sólo para bienes raíces. Se nota en lo que no tiene.
            </h2>
            <p className="mk-lead" style={{ marginTop: '18px', maxWidth: '620px' }}>
              Casi todos los CRM del mercado sirven para vender cualquier cosa, y por
              eso hay que enseñarles el negocio. Este ya lo sabe.
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <div className="mk-absent">
              {ABSENT.map(a => (
                <div key={a.title} className="mk-absent-item">
                  <span className="mk-absent-mark" aria-hidden>—</span>
                  <div>
                    <h3 className="mk-item-title">{a.title}</h3>
                    <p className="mk-body" style={{ fontSize: '13px', marginTop: '6px' }}>{a.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CÓMO EMPEZAMOS */}
      <section id="como-funciona" className="mk-container mk-section">
        <Reveal>
          <span className="mk-eyebrow">Cómo empezamos</span>
          <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '620px' }}>
            De la primera conversación a estar operando, en días
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="mk-steps">
            {STEPS.map(s => (
              <div key={s.n} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', height: '100%' }}>
                <span className="mk-num" style={{ fontSize: '13px', color: 'var(--accent-gold)', fontWeight: 600 }}>
                  {s.n}
                </span>
                <h3 className="mk-item-title" style={{ fontSize: '16px', marginTop: '10px' }}>{s.title}</h3>
                <p className="mk-body" style={{ fontSize: '13px', marginTop: '8px', maxWidth: '320px' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* INVERSIÓN */}
      <section id="inversion" className="mk-container mk-section" style={{ paddingTop: '32px' }}>
        <Reveal>
          <div className="mk-invest">
            <div>
              <span className="mk-eyebrow">Inversión</span>
              <h2 className="mk-h2" style={{ marginTop: '14px' }}>
                Desde <span className="mk-num">{ENTRY_PRICE}</span> al mes
              </h2>
              <p className="mk-body" style={{ marginTop: '16px', maxWidth: '460px' }}>
                Tres planes, según trabajes solo o con equipo. Todos incluyen lo
                mismo por dentro: la calificación de cada lead, el análisis con IA y
                las secuencias de correo. Lo que cambia es la capacidad y cuántos
                agentes tienen su propio acceso.
              </p>
              <p className="mk-body" style={{ marginTop: '12px', maxWidth: '460px' }}>
                Con la comisión de una sola operación cerrada, la inversión de un año
                entero queda cubierta.
              </p>
            </div>
            <div className="mk-invest-panel">
              <span className="mk-eyebrow">Prueba {TRIAL.days} días</span>
              <p style={{ fontSize: '17px', lineHeight: 1.5, color: 'var(--text-primary)', marginTop: '12px' }}>
                Pruébalo con tus propios leads,{' '}
                <span className="mk-gradient-text">totalmente gratis</span>.
              </p>
              <p className="mk-body" style={{ fontSize: '13px', marginTop: '10px' }}>
                {TRIAL.days} días con la experiencia {PLANS[TRIAL.plan].label} completa,
                sin tarjeta de crédito y con la IA incluida de cortesía.
              </p>
              <a href="#contacto" className="mk-btn-gold btn-cta" style={{ marginTop: '22px', width: '100%' }}>
                Empieza tu prueba
              </a>
              <Link href="/planes" className="mk-invest-link">
                Compara los planes en detalle — y contra el resto del mercado →
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* CONTACTO */}
      <section id="contacto" className="mk-band">
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <Backdrop intensity={0.45} />
        <div className="mk-container mk-section" style={{ position: 'relative' }}>
          <div className="mk-contact">
            <Reveal>
              <span className="mk-eyebrow">Contacto</span>
              <h2 className="mk-h2" style={{ marginTop: '14px' }}>
                Hablemos de tu operación
              </h2>
              <p className="mk-body" style={{ marginTop: '14px', maxWidth: '400px' }}>
                Cuéntanos cómo trabaja tu equipo hoy y te mostramos, en una llamada,
                cómo se vería operando aquí. Respondemos en menos de 24 horas
                hábiles.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <ContactForm />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
