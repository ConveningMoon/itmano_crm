'use client'

import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import CountUp from 'react-countup'
import {
  Home, DollarSign, FileText, Users, Map, Shield, ArrowRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─── Color system ─────────────────────────────────────────────────────────────

const C = {
  navy:      '#1B2F5B',
  navyMid:   '#2A4580',
  navyLight: '#3A5A9B',
  navyDark:  '#0F1F3D',
  gold:      '#C9A96E',
  goldLight: '#E8C98A',
  goldDim:   '#A08445',
  white:     '#FFFFFF',
  offWhite:  '#FAFAF8',
  gray:      '#F3F2F0',
  grayMid:   '#E2DDD8',
  textDark:  '#1B2F5B',
  textMid:   '#4A5568',
  textLight: '#8A96A8',
  green:     '#2D7A4F',
  greenBg:   '#EBF7F1',
  coral:     '#C97B6B',
}

// ─── Animation helpers ────────────────────────────────────────────────────────

function FadeUp({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode
  delay?: number
  style?: React.CSSProperties
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

function StaggerList({ children, staggerDelay = 0.1 }: { children: React.ReactNode[]; staggerDelay?: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })
  return (
    <motion.div ref={ref} style={{ display: 'contents' }}>
      {children.map((child, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -24 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, delay: i * staggerDelay, ease: 'easeOut' }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  )
}

function FloatLoop({ children, amplitude = 12, duration = 4, style }: { children: React.ReactNode; amplitude?: number; duration?: number; style?: React.CSSProperties }) {
  return (
    <motion.div
      animate={{ y: [0, -amplitude, 0] }}
      transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
      style={style}
    >
      {children}
    </motion.div>
  )
}

function AnimatedNumber({ end, suffix = '' }: { end: number; suffix?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  return (
    <span ref={ref}>
      {isInView ? <CountUp end={end} duration={2} /> : '0'}{suffix}
    </span>
  )
}

const PARTICLE_DEFS = [
  { width: '6px',  height: '6px',  top: '15%', left: '5%',  delay: 0   },
  { width: '10px', height: '10px', top: '70%', left: '8%',  delay: 0.7 },
  { width: '4px',  height: '4px',  top: '30%', left: '92%', delay: 1.4 },
  { width: '8px',  height: '8px',  top: '80%', left: '88%', delay: 0.3 },
  { width: '6px',  height: '6px',  top: '50%', left: '15%', delay: 1.0 },
  { width: '12px', height: '12px', top: '20%', left: '75%', delay: 1.8 },
  { width: '5px',  height: '5px',  top: '60%', left: '60%', delay: 0.5 },
  { width: '7px',  height: '7px',  top: '10%', left: '45%', delay: 1.2 },
]

function Particles({ count = 8 }: { count?: number }) {
  return (
    <>
      {PARTICLE_DEFS.slice(0, count).map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            borderRadius: '50%',
            background: C.gold,
            pointerEvents: 'none',
            width: p.width,
            height: p.height,
            top: p.top,
            left: p.left,
          }}
          animate={{ y: [0, -20, 0], opacity: [0.1, 0.25, 0.1], scale: [1, 1.2, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
        />
      ))}
    </>
  )
}

function Wave({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <div style={{ transform: flip ? 'scaleY(-1)' : 'none', marginBottom: '-4px', lineHeight: 0 }}>
      <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
        <path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z" fill={color} />
      </svg>
    </div>
  )
}

// ─── Breakpoint hook ──────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const heroStats = [
  { number: 100, suffix: '+', label: 'Familias que compraron su casa' },
  { number: 10,  suffix: '+', label: 'Años de experiencia en Virginia' },
  { number: 47,  suffix: '',  label: 'Descargas este mes' },
  { number: 5,   suffix: '★', label: 'Calificación promedio' },
]

const guideContents = [
  { icon: <DollarSign size={22} />, title: 'Dinero para el enganche', desc: 'Programas de asistencia para familias hispanas — muchos no saben que existen.' },
  { icon: <FileText size={22} />, title: 'El proceso paso a paso', desc: 'Desde la pre-aprobación hasta el cierre, sin tecnicismos ni sorpresas.' },
  { icon: <Shield size={22} />, title: 'ITIN y opciones sin SSN', desc: 'Cómo comprar incluso si aún no tienes número de seguro social.' },
  { icon: <Home size={22} />, title: 'Vecindarios recomendados', desc: 'Las mejores zonas para familias hispanas en Hampton Roads y Charlotte.' },
  { icon: <Users size={22} />, title: 'Negociación en español', desc: 'Cómo hacer una oferta competitiva en el mercado actual de Virginia.' },
  { icon: <Map size={22} />, title: 'Virginia vs North Carolina', desc: 'Diferencias clave de impuestos, escuelas y costo de vida entre ambos estados.' },
]

const testimonials = [
  {
    name: 'Familia García',
    location: 'Virginia Beach, VA',
    quote: 'Adriana entiende las necesidades de las familias porque ella también es mamá. Nos encontró la casa perfecta con el patio que nuestros hijos necesitaban. La guía nos dio confianza antes de la primera llamada.',
    initial: 'G',
  },
  {
    name: 'Familia Cuevas',
    location: 'Hampton, VA',
    quote: 'Como compradores primerizos, la guía respondió todas nuestras preguntas antes de hablar con Adriana. Hizo que el proceso fuera fácil y sin estrés. Ahora tenemos el hogar de nuestros sueños.',
    initial: 'C',
  },
  {
    name: 'Familia Ramírez',
    location: 'Charlotte, NC',
    quote: 'Descargué la guía pensando que sería información genérica. Me sorprendió lo específica que era para Virginia y NC. En 3 meses ya teníamos la casa perfecta para nuestra familia de 5.',
    initial: 'R',
  },
]

// ─── Form types ───────────────────────────────────────────────────────────────

interface Step1 { firstName: string; lastName: string; email: string; phone: string }
interface Step2 { timeline: string; budget: string; situation: string }

// ─── Radio option ─────────────────────────────────────────────────────────────

function RadioOption({ value, selected, onSelect, children }: { value: string; selected: boolean; onSelect: (v: string) => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(value)}
      style={{
        width: '100%',
        padding: '12px 16px',
        borderRadius: '10px',
        border: selected ? `2px solid ${C.gold}` : `2px solid ${C.grayMid}`,
        background: selected ? 'rgba(201,169,110,0.08)' : C.white,
        color: selected ? C.navy : C.textMid,
        fontSize: '14px',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <div style={{
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        border: selected ? `5px solid ${C.gold}` : `2px solid ${C.grayMid}`,
        flexShrink: 0,
        transition: 'all 0.2s',
      }} />
      {children}
    </motion.button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const router = useRouter()
  const isMobile = useIsMobile()

  const [step, setStep] = useState<1 | 2>(1)
  const [s1, setS1] = useState<Step1>({ firstName: '', lastName: '', email: '', phone: '' })
  const [s2, setS2] = useState<Step2>({ timeline: '', budget: '', situation: '' })
  const [focused, setFocused] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Step1>>({})

  const scrollToForm = () => document.getElementById('form-section')?.scrollIntoView({ behavior: 'smooth' })

  const validateAndNext = () => {
    const e: Partial<Step1> = {}
    if (!s1.firstName.trim()) e.firstName = 'Requerido'
    if (!s1.email.trim()) e.email = 'Requerido'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s1.email)) e.email = 'Email inválido'
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep(2)
  }

  const submitStep2 = () => {
    if (!s2.timeline || !s2.budget || !s2.situation) return
    router.push('/lm/guia-familias-hispanas/thank-you')
  }

  const inputSx = (field: string, err?: boolean): React.CSSProperties => ({
    width: '100%',
    padding: '13px 16px',
    borderRadius: '10px',
    border: err ? `2px solid ${C.coral}` : focused === field ? `2px solid ${C.gold}` : `2px solid ${C.grayMid}`,
    boxShadow: focused === field && !err ? '0 0 0 3px rgba(201,169,110,0.15)' : 'none',
    fontSize: '15px',
    color: C.navy,
    background: C.white,
    outline: 'none',
    transition: 'all 0.2s',
    boxSizing: 'border-box' as const,
  })

  const labelSx: React.CSSProperties = { display: 'block', fontSize: '13px', fontWeight: 600, color: C.textDark, marginBottom: '6px' }

  const line1 = ['Tu', 'Primera', 'Casa', 'en']
  const line2 = ['Virginia', 'o', 'North', 'Carolina']

  const s2Complete = s2.timeline && s2.budget && s2.situation

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', overflowX: 'hidden' }}>

      {/* ══ HERO ═══════════════════════════════════════════════════════════ */}
      <section style={{
        background: `
          radial-gradient(ellipse at 20% 50%, #2A4580 0%, transparent 60%),
          radial-gradient(ellipse at 80% 20%, #1B5B3A 0%, transparent 50%),
          #0F1F3D
        `,
        padding: '80px 24px 100px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <Particles count={8} />

        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '7fr 5fr',
            gap: isMobile ? '48px' : '32px',
            alignItems: 'center',
          }}>
            {/* Left */}
            <div>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: 'backOut' }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid rgba(201,169,110,0.5)',
                  background: 'rgba(201,169,110,0.1)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: C.goldLight,
                  letterSpacing: '0.04em',
                  marginBottom: '24px',
                }}
              >
                🏡 Guía Gratuita · Virginia &amp; North Carolina
              </motion.div>

              <h1 style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontStyle: 'italic',
                fontSize: 'clamp(40px, 5.5vw, 60px)',
                fontWeight: 400,
                color: C.white,
                lineHeight: 1.15,
                margin: '0 0 20px',
              }}>
                {line1.map((word, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
                    style={{ display: 'inline-block', marginRight: '0.3em', color: word === 'Primera' ? C.gold : C.white }}
                  >
                    {word}
                  </motion.span>
                ))}
                <br />
                {line2.map((word, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.1 }}
                    style={{ display: 'inline-block', marginRight: '0.3em' }}
                  >
                    {word}
                  </motion.span>
                ))}
              </h1>

              <FadeUp delay={0.8}>
                <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.78)', fontWeight: 300, lineHeight: 1.6, marginBottom: '28px' }}>
                  La guía en español que explica exactamente cómo comprar tu primera casa — sin importar tu historial de crédito o si tienes ITIN.
                </p>
              </FadeUp>

              <FadeUp delay={1.0}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
                  {['✓ 100% Gratis · En Español', '✓ Virginia & NC', '✓ +100 Familias'].map(pill => (
                    <span
                      key={pill}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '20px',
                        border: '1px solid rgba(201,169,110,0.4)',
                        background: 'rgba(201,169,110,0.1)',
                        fontSize: '13px',
                        color: C.goldLight,
                        fontWeight: 500,
                      }}
                    >
                      {pill}
                    </span>
                  ))}
                </div>
              </FadeUp>

              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                whileHover={{ scale: 1.04, boxShadow: '0 12px 40px rgba(201,169,110,0.4)' }}
                whileTap={{ scale: 0.97 }}
                onClick={scrollToForm}
                style={{
                  background: C.gold,
                  color: C.navy,
                  fontSize: '17px',
                  fontWeight: 700,
                  padding: '16px 36px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                → Quiero mi guía gratis
              </motion.button>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
                style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '12px' }}
              >
                Sin spam. Tu guía llega al email en segundos.
              </motion.p>
            </div>

            {/* Right — book + photo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <FloatLoop amplitude={14} duration={4.5}>
                <motion.div
                  initial={{ opacity: 0, rotateY: -30, scale: 0.8 }}
                  animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                  transition={{ duration: 1.0, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                  style={{ perspective: '800px', transformStyle: 'preserve-3d' }}
                >
                  <Image
                    src="/mockup.png"
                    alt="Tu Primera Casa en Estados Unidos - Guía Gratuita"
                    width={320}
                    height={400}
                    style={{
                      objectFit: 'contain',
                      filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.6))',
                      maxWidth: '280px',
                      display: 'block',
                    }}
                    priority
                  />
                </motion.div>
              </FloatLoop>

              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.8 }}
                style={{ marginTop: '-60px', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 2 }}
              >
                <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                    style={{
                      position: 'absolute',
                      inset: '-4px',
                      borderRadius: '50%',
                      background: `conic-gradient(${C.gold}, transparent, ${C.gold}, transparent, ${C.gold})`,
                    }}
                  />
                  <div style={{
                    width: '140px',
                    height: '140px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: `4px solid ${C.navyDark}`,
                    position: 'relative',
                    zIndex: 1,
                  }}>
                    <Image
                      src="/adriana_face.JPG"
                      alt="Adriana Melendez"
                      fill
                      style={{ objectFit: 'cover', objectPosition: 'top' }}
                    />
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.2, type: 'spring', stiffness: 200 }}
                    style={{
                      position: 'absolute',
                      bottom: '-8px',
                      right: '-8px',
                      background: C.gold,
                      color: C.navy,
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '20px',
                      whiteSpace: 'nowrap',
                      border: `2px solid ${C.navyDark}`,
                      zIndex: 2,
                    }}
                  >
                    ⭐ Top 7% VA
                  </motion.div>
                </div>
              </motion.div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0 }}
                style={{ textAlign: 'center', marginTop: '16px', color: 'rgba(255,255,255,0.75)', fontSize: '13px' }}
              >
                Adriana Melendez · A&amp;J Real Estate Group
              </motion.p>
            </div>
          </div>

          {/* Stats bar */}
          <FadeUp delay={0.6} style={{ marginTop: '60px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(10px)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              padding: '20px 24px',
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
            }}>
              {heroStats.map((stat, i) => (
                <div key={i} style={{
                  textAlign: 'center',
                  padding: '12px 8px',
                  borderRight: i < 3 && !isMobile ? '1px solid rgba(255,255,255,0.1)' : 'none',
                }}>
                  <div style={{
                    fontFamily: '"Cormorant Garamond", Georgia, serif',
                    fontSize: '32px',
                    color: C.gold,
                    lineHeight: 1,
                    marginBottom: '6px',
                  }}>
                    <AnimatedNumber end={stat.number} suffix={stat.suffix} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <Wave color={C.offWhite} />

      {/* ══ FORM ═══════════════════════════════════════════════════════════ */}
      <section id="form-section" style={{ background: C.offWhite, padding: '80px 24px' }}>
        <FadeUp>
          <h2 style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 400,
            color: C.navy,
            textAlign: 'center',
            marginBottom: '8px',
          }}>
            Recibe tu guía <em style={{ color: C.gold }}>gratis</em> ahora
          </h2>
          <p style={{ textAlign: 'center', color: C.textMid, fontSize: '16px', marginBottom: '40px' }}>
            Completa los datos — te la enviamos al instante
          </p>
        </FadeUp>

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            background: C.white,
            borderRadius: '24px',
            boxShadow: '0 20px 80px rgba(27,47,91,0.14)',
            padding: isMobile ? '28px 24px' : '44px',
            border: `1px solid ${C.grayMid}`,
          }}
        >
          {/* Progress */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: C.textLight }}>Paso {step} de 2</span>
              <span style={{ fontSize: '12px', color: C.gold, fontWeight: 500 }}>{step === 1 ? '50%' : '100%'} completado</span>
            </div>
            <div style={{ height: '4px', background: C.gray, borderRadius: '2px', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: step === 1 ? '50%' : '100%' }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ height: '100%', background: C.gold, borderRadius: '2px' }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelSx}>Nombre *</label>
                    <input type="text" placeholder="María" value={s1.firstName}
                      onChange={e => setS1(p => ({ ...p, firstName: e.target.value }))}
                      onFocus={() => setFocused('firstName')} onBlur={() => setFocused(null)}
                      style={inputSx('firstName', !!errors.firstName)}
                    />
                    {errors.firstName && <p style={{ fontSize: '12px', color: C.coral, margin: '4px 0 0' }}>{errors.firstName}</p>}
                  </div>
                  <div>
                    <label style={labelSx}>Apellido</label>
                    <input type="text" placeholder="González" value={s1.lastName}
                      onChange={e => setS1(p => ({ ...p, lastName: e.target.value }))}
                      onFocus={() => setFocused('lastName')} onBlur={() => setFocused(null)}
                      style={inputSx('lastName')}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelSx}>Email *</label>
                  <input type="email" placeholder="maria@email.com" value={s1.email}
                    onChange={e => setS1(p => ({ ...p, email: e.target.value }))}
                    onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
                    style={inputSx('email', !!errors.email)}
                  />
                  {errors.email && <p style={{ fontSize: '12px', color: C.coral, margin: '4px 0 0' }}>{errors.email}</p>}
                </div>
                <div style={{ marginBottom: '28px' }}>
                  <label style={labelSx}>Teléfono (opcional)</label>
                  <input type="tel" placeholder="(757) 000-0000" value={s1.phone}
                    onChange={e => setS1(p => ({ ...p, phone: e.target.value }))}
                    onFocus={() => setFocused('phone')} onBlur={() => setFocused(null)}
                    style={inputSx('phone')}
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 32px rgba(201,169,110,0.35)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={validateAndNext}
                  style={{
                    width: '100%', padding: '15px',
                    background: C.navy, color: C.white,
                    fontSize: '16px', fontWeight: 600,
                    borderRadius: '12px', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  Continuar <ArrowRight size={18} />
                </motion.button>
                <p style={{ fontSize: '12px', color: C.textLight, textAlign: 'center', marginTop: '12px' }}>
                  🔒 Tus datos están seguros. Sin spam.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ fontSize: '18px', fontWeight: 600, color: C.navy, marginBottom: '24px' }}
                >
                  ¡Casi lista, {s1.firstName}! 🎉
                </motion.p>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelSx}>¿Cuándo piensas comprar?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['En los próximos 3 meses', 'En 3–6 meses', 'En 6–12 meses', 'Solo explorando'].map(v => (
                      <RadioOption key={v} value={v} selected={s2.timeline === v} onSelect={v => setS2(p => ({ ...p, timeline: v }))}>{v}</RadioOption>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={labelSx}>¿Cuál es tu presupuesto aproximado?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['Menos de $250k', '$250k – $350k', '$350k – $500k', 'Más de $500k'].map(v => (
                      <RadioOption key={v} value={v} selected={s2.budget === v} onSelect={v => setS2(p => ({ ...p, budget: v }))}>{v}</RadioOption>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '28px' }}>
                  <label style={labelSx}>¿En qué situación estás?</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {['Soy inquilino(a), quiero ser propietario(a)', 'Ya tengo pre-aprobación', 'Busco más información antes de decidir'].map(v => (
                      <RadioOption key={v} value={v} selected={s2.situation === v} onSelect={v => setS2(p => ({ ...p, situation: v }))}>{v}</RadioOption>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setStep(1)}
                    style={{
                      padding: '14px 20px',
                      background: 'transparent',
                      color: C.textMid,
                      border: `2px solid ${C.grayMid}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                    }}
                  >
                    ← Atrás
                  </button>
                  <motion.button
                    whileHover={s2Complete ? { scale: 1.02, boxShadow: '0 8px 32px rgba(201,169,110,0.35)' } : {}}
                    whileTap={s2Complete ? { scale: 0.98 } : {}}
                    onClick={submitStep2}
                    disabled={!s2Complete}
                    style={{
                      flex: 1,
                      padding: '14px',
                      background: s2Complete ? C.gold : C.grayMid,
                      color: s2Complete ? C.navy : C.textLight,
                      fontSize: '16px',
                      fontWeight: 700,
                      borderRadius: '12px',
                      border: 'none',
                      cursor: s2Complete ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                    }}
                  >
                    ✓ Enviar y recibir mi guía
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      <Wave color={C.gray} flip />

      {/* ══ GUIDE CONTENTS ═════════════════════════════════════════════════ */}
      <section style={{ background: C.gray, padding: '80px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <FadeUp>
            <p style={{ color: C.gold, fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>
              CONTENIDO DE LA GUÍA
            </p>
            <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 400, color: C.navy, textAlign: 'center', marginBottom: '8px' }}>
              23 páginas de información que realmente importa
            </h2>
            <p style={{ textAlign: 'center', color: C.textMid, fontSize: '15px', maxWidth: '500px', margin: '0 auto 48px' }}>
              Sin relleno, sin tecnicismos — solo lo que necesitas saber para comprar tu casa en Virginia o North Carolina
            </p>
          </FadeUp>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: '16px',
          }}>
            <StaggerList staggerDelay={0.08}>
              {guideContents.map((item, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -4, boxShadow: '0 8px 32px rgba(27,47,91,0.12)', borderColor: 'rgba(201,169,110,0.3)' }}
                  transition={{ duration: 0.2 }}
                  style={{
                    background: C.white,
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 2px 12px rgba(27,47,91,0.06)',
                    border: '1px solid transparent',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                  }}
                >
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(201,169,110,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: C.gold,
                    flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: C.navy, marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ fontSize: '13px', color: C.textMid, lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </motion.div>
              ))}
            </StaggerList>
          </div>
        </div>
      </section>

      <Wave color={C.white} />

      {/* ══ ADRIANA ════════════════════════════════════════════════════════ */}
      <section style={{ background: C.white, padding: '80px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '5fr 7fr',
            gap: isMobile ? '40px' : '64px',
            alignItems: 'start',
          }}>
            {/* Photo */}
            <FadeUp style={{ position: 'relative' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                style={{
                  position: 'absolute',
                  top: '24px', left: '24px', right: '-12px', bottom: '-12px',
                  background: `linear-gradient(135deg, ${C.gold}20, ${C.navy}15)`,
                  borderRadius: '20px',
                  border: `2px solid ${C.gold}30`,
                }}
              />
              <div style={{
                position: 'relative',
                borderRadius: '16px',
                overflow: 'hidden',
                aspectRatio: '3/4',
                border: `3px solid ${C.white}`,
                boxShadow: '0 20px 60px rgba(27,47,91,0.2)',
              }}>
                <Image src="/adriana_face.JPG" alt="Adriana Melendez" fill style={{ objectFit: 'cover', objectPosition: 'top center' }} />
              </div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                style={{
                  position: 'absolute',
                  bottom: '24px', right: '-16px',
                  background: C.white,
                  borderRadius: '12px',
                  padding: '12px 16px',
                  boxShadow: '0 8px 32px rgba(27,47,91,0.15)',
                  border: `1px solid ${C.grayMid}`,
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '2px' }}>⭐</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: C.navy }}>Top 7%</div>
                <div style={{ fontSize: '11px', color: C.textLight }}>Hampton Roads</div>
              </motion.div>
            </FadeUp>

            {/* Bio */}
            <FadeUp delay={0.2}>
              <p style={{ color: C.gold, fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
                QUIÉN ESCRIBIÓ ESTA GUÍA
              </p>
              <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 400, color: C.navy, marginBottom: '20px', lineHeight: 1.2 }}>
                Adriana Melendez
              </h2>
              <div style={{ fontSize: '15px', color: C.textMid, lineHeight: 1.8, marginBottom: '28px' }}>
                <p style={{ marginBottom: '16px' }}>Hola, soy Adriana. Llegué a Virginia como muchas familias hispanas — con sueños grandes y muchas preguntas sin responder.</p>
                <p style={{ marginBottom: '16px' }}>Hoy soy agente inmobiliaria con más de 10 años de experiencia, madre de tres, y he ayudado a más de 100 familias a encontrar su hogar en Virginia y North Carolina.</p>
                <p>Esta guía es lo que hubiera querido tener cuando <em>yo</em> estaba buscando mi primera casa.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                {[
                  { icon: '📍', text: 'Virginia & North Carolina' },
                  { icon: '⭐', text: 'Top 7% Hampton Roads 2024' },
                  { icon: '🏠', text: '+100 familias ayudadas' },
                  { icon: '🗣️', text: 'Español · English · Português' },
                ].map((item, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: C.gray, borderRadius: '10px', fontSize: '13px', color: C.textDark, fontWeight: 500 }}
                  >
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>{item.text}
                  </motion.div>
                ))}
              </div>
              <motion.blockquote
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                style={{ borderLeft: `4px solid ${C.gold}`, paddingLeft: '20px', fontStyle: 'italic', fontSize: '16px', color: C.textMid, lineHeight: 1.7, margin: 0 }}
              >
                Cada familia merece encontrar su hogar sin perderse en el proceso. Por eso escribí esta guía — para que el camino sea más claro.
              </motion.blockquote>
            </FadeUp>
          </div>
        </div>
      </section>

      <Wave color="rgba(27,47,91,0.04)" />

      {/* ══ TESTIMONIALS ════════════════════════════════════════════════════ */}
      <section style={{ background: 'rgba(27,47,91,0.03)', padding: '80px 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <FadeUp style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ color: C.gold, fontSize: '11px', fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
              LO QUE DICEN LAS FAMILIAS
            </p>
            <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 400, color: C.navy }}>
              Familias que ya tienen su casa en Virginia
            </h2>
          </FadeUp>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '20px' }}>
            <StaggerList staggerDelay={0.12}>
              {testimonials.map((t, i) => (
                <motion.div key={i}
                  whileHover={{ y: -6, boxShadow: '0 16px 48px rgba(27,47,91,0.12)' }}
                  transition={{ duration: 0.3 }}
                  style={{
                    background: C.white,
                    borderRadius: '20px',
                    padding: '28px',
                    boxShadow: '0 4px 20px rgba(27,47,91,0.07)',
                    border: `1px solid ${C.grayMid}`,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: '-10px', left: '16px', fontSize: '80px', color: C.gold, opacity: 0.12, fontFamily: '"Cormorant Garamond", Georgia, serif', lineHeight: 1, userSelect: 'none' }}></div>
                  <div style={{ color: C.gold, fontSize: '16px', marginBottom: '14px' }}>★★★★★</div>
                  <p style={{ fontSize: '14px', color: C.textMid, lineHeight: 1.75, marginBottom: '20px', position: 'relative', zIndex: 1 }}>{t.quote}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: `linear-gradient(135deg, ${C.navy}, ${C.navyMid})`, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 600, flexShrink: 0 }}>
                      {t.initial}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: C.navy }}>{t.name}</div>
                      <div style={{ fontSize: '12px', color: C.textLight }}>📍 {t.location}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </StaggerList>
          </div>
        </div>
      </section>

      <Wave color={C.navy} flip />

      {/* ══ FINAL CTA ═══════════════════════════════════════════════════════ */}
      <section style={{ background: 'linear-gradient(135deg, #0F1F3D, #1B2F5B)', padding: '80px 24px', position: 'relative', overflow: 'hidden' }}>
        <Particles count={6} />
        <FadeUp style={{ textAlign: 'center', position: 'relative', zIndex: 1, maxWidth: '560px', margin: '0 auto' }}>
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{ fontSize: '48px', marginBottom: '16px' }}
          >
            🏡
          </motion.div>
          <h2 style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', fontStyle: 'italic', fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 400, color: C.white, marginBottom: '16px', lineHeight: 1.2 }}>
            ¿Lista para dar el primer paso?
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.72)', maxWidth: '480px', margin: '0 auto 36px' }}>
            Tu guía gratuita te espera. Sin compromisos. Solo información que funciona.
          </p>
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: '0 16px 48px rgba(201,169,110,0.5)' }}
            whileTap={{ scale: 0.97 }}
            onClick={scrollToForm}
            style={{ background: C.gold, color: C.navy, fontSize: '18px', fontWeight: 700, padding: '18px 44px', borderRadius: '14px', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            → Quiero mi guía gratis
          </motion.button>
          <p style={{ color: C.gold, fontSize: '13px', marginTop: '20px', opacity: 0.8 }}>
            Virginia · North Carolina · En Español
          </p>
        </FadeUp>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
      <footer style={{ background: C.navyDark, padding: '28px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: C.gold, letterSpacing: '0.1em', marginBottom: '6px' }}>A&amp;J REAL ESTATE GROUP</p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>
          Adriana Melendez · adrysofirealestate@gmail.com · (757) 715-9052
        </p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>Virginia &amp; North Carolina, USA · © 2026</p>
      </footer>
    </div>
  )
}
