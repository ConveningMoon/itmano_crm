'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  Lock,
  ArrowRight,
  Download,
  MapPin,
  PiggyBank,
  TrendingUp,
  ListChecks,
  FileCheck,
  AlertTriangle,
} from 'lucide-react'

// ─── Design tokens (self-contained, no CRM CSS vars) ─────────────────────────

const F = {
  navy:      '#1B2F5B',
  navyLight: '#2A4580',
  navyDark:  '#0F1F3D',
  gold:      '#C9A96E',
  goldLight: '#E8C98A',
  white:     '#FFFFFF',
  offWhite:  '#FAFAF8',
  gray:      '#F3F2F0',
  grayMid:   '#E8E6E1',
  textDark:  '#1B2F5B',
  textMid:   '#4A5568',
  textLight: '#8A96A8',
  green:     '#2D7A4F',
  greenBg:   '#EBF7F1',
  shadowSm:  '0 2px 8px rgba(27,47,91,0.08)',
  shadowMd:  '0 8px 32px rgba(27,47,91,0.12)',
  shadowLg:  '0 20px 60px rgba(27,47,91,0.16)',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step1Data { firstName: string; email: string; phone: string }
interface Step2Data { situation: string; timeline: string; budget: string }

// ─── Sub-components ───────────────────────────────────────────────────────────

function RadioOption({
  label, value, selected, onSelect,
}: {
  label: string; value: string; selected: boolean; onSelect: (v: string) => void
}) {
  return (
    <div
      onClick={() => onSelect(value)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 14px',
        borderRadius: '8px',
        cursor: 'pointer',
        border: `1.5px solid ${selected ? F.gold : F.grayMid}`,
        background: selected ? 'rgba(201,169,110,0.06)' : F.white,
        marginBottom: '8px',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          flexShrink: 0,
          border: selected ? `6px solid ${F.gold}` : `2px solid ${F.grayMid}`,
          boxSizing: 'border-box',
          transition: 'border 0.15s',
        }}
      />
      <span style={{ fontSize: '14px', color: F.textDark, lineHeight: 1.4 }}>{label}</span>
    </div>
  )
}

const CONTENT_ICONS: Record<string, React.ReactNode> = {
  PiggyBank:     <PiggyBank size={20} color={F.gold} />,
  TrendingUp:    <TrendingUp size={20} color={F.gold} />,
  ListChecks:    <ListChecks size={20} color={F.gold} />,
  MapPin:        <MapPin size={20} color={F.gold} />,
  FileCheck:     <FileCheck size={20} color={F.gold} />,
  AlertTriangle: <AlertTriangle size={20} color={F.gold} />,
}

const contents = [
  { number: '01', title: '¿Cuánto necesitas ahorrar realmente?', desc: 'La verdad sobre el down payment en Virginia. Programas de asistencia que pocos conocen.', icon: 'PiggyBank' },
  { number: '02', title: 'Tu puntaje de crédito y cómo mejorarlo', desc: 'Qué score necesitas para comprar casa y un plan semana a semana para llegar ahí.', icon: 'TrendingUp' },
  { number: '03', title: 'El proceso de compra explicado en español', desc: 'Los 8 pasos desde que decides hasta que recibes las llaves, sin sorpresas.', icon: 'ListChecks' },
  { number: '04', title: 'Los mejores vecindarios en Virginia y NC', desc: 'Hampton Roads, Northern Virginia, Charlotte y Raleigh — dónde viven las familias hispanas y por qué.', icon: 'MapPin' },
  { number: '05', title: 'Documentos que necesitas tener listos', desc: 'El checklist completo. Qué piden los bancos y cómo conseguirlo si eres inmigrante.', icon: 'FileCheck' },
  { number: '06', title: 'Errores que cuestan miles de dólares', desc: 'Los 5 errores más comunes de compradores primerizos — y cómo evitarlos antes de empezar.', icon: 'AlertTriangle' },
]

const testimonials = [
  { name: 'Familia García', location: 'Virginia Beach, VA', quote: 'Adriana entiende las necesidades de las familias porque ella también es mamá. Nos encontró la casa perfecta con el patio que nuestros hijos necesitaban. ¡Gracias por todo!', stars: 5, initial: 'G' },
  { name: 'Familia Cuevas', location: 'Hampton, VA', quote: 'Como compradores primerizos, Adriana nos guió paso a paso. Hizo que el proceso fuera fácil y sin estrés. La descarga de la guía fue el primer paso que cambió todo.', stars: 5, initial: 'C' },
  { name: 'Familia Ramírez', location: 'Charlotte, NC', quote: 'Adriana nos ayudó a encontrar la casa perfecta para nuestra familia de 5. Su experiencia como mamá la hizo entender exactamente lo que necesitábamos.', stars: 5, initial: 'R' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FunnelPage() {
  const router = useRouter()
  const formRef = useRef<HTMLDivElement>(null)

  const [step, setStep]   = useState<1 | 2>(1)
  const [step1, setStep1] = useState<Step1Data>({ firstName: '', email: '', phone: '' })
  const [step2, setStep2] = useState<Step2Data>({ situation: '', timeline: '', budget: '' })
  const [errors, setErrors] = useState<Partial<Step1Data>>({})

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const validateStep1 = (): boolean => {
    const e: Partial<Step1Data> = {}
    if (!step1.firstName.trim()) e.firstName = 'Por favor escribe tu nombre'
    if (!step1.email.trim()) e.email = 'Necesitamos tu email para enviarte la guía'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(step1.email)) e.email = 'El email no parece correcto'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleStep1Submit = () => { if (validateStep1()) setStep(2) }
  const handleStep2Submit = () => router.push('/lm/guia-familias-hispanas/thank-you')

  const isStep1Disabled = !step1.firstName.trim() || !step1.email.trim()

  // ─── input style ───────────────────────────────────────────────────────────
  const fInput: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    fontSize: '15px',
    border: `1.5px solid ${F.grayMid}`,
    borderRadius: '10px',
    background: F.white,
    color: F.textDark,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'Inter, system-ui, sans-serif',
  }
  const fInputErr: React.CSSProperties = { ...fInput, borderColor: '#C97B6B' }
  const fLabel: React.CSSProperties = {
    display: 'block', fontSize: '14px', fontWeight: 500, color: F.navy, marginBottom: '6px',
  }
  const fErr: React.CSSProperties = { fontSize: '12px', color: '#C97B6B', marginTop: '4px' }

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .funnel-hero-grid   { grid-template-columns: 1fr !important; }
          .funnel-adriana-grid{ grid-template-columns: 1fr !important; }
          .funnel-content-grid{ grid-template-columns: 1fr !important; }
          .funnel-test-grid   { grid-template-columns: 1fr !important; }
        }
        .funnel-hero-cta:hover   { background: #E8C98A !important; transform: translateY(-2px) !important; box-shadow: 0 8px 32px rgba(27,47,91,0.2) !important; }
        .funnel-cta-final:hover  { background: #E8C98A !important; transform: translateY(-2px) !important; box-shadow: 0 8px 32px rgba(27,47,91,0.2) !important; }
        .funnel-step1-btn:hover:not(:disabled) { background: #2A4580 !important; transform: translateY(-1px) !important; }
        .funnel-step2-btn:hover  { background: #E8C98A !important; transform: translateY(-1px) !important; }
        .funnel-input:focus      { border-color: #C9A96E !important; box-shadow: 0 0 0 3px rgba(201,169,110,0.15) !important; }
        .funnel-content-block:hover { box-shadow: 0 8px 32px rgba(27,47,91,0.12) !important; transform: translateY(-2px); }
        .funnel-content-block    { transition: box-shadow 0.2s, transform 0.2s; }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .step2-enter { animation: fadeInUp 0.3s ease forwards; }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 1 — HERO
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: F.navy, padding: '72px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div
            className="funnel-hero-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '48px',
              alignItems: 'center',
            }}
          >
            {/* Left column */}
            <div>
              {/* Eyebrow */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: 'rgba(201,169,110,0.2)',
                border: '1px solid rgba(201,169,110,0.4)',
                color: F.gold,
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.08em',
                marginBottom: '20px',
              }}>
                🏡 Guía Gratuita · Virginia & North Carolina
              </div>

              {/* Headline */}
              <h1 style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 'clamp(36px, 5vw, 52px)',
                fontWeight: 400,
                lineHeight: 1.15,
                color: F.white,
                margin: '0 0 16px',
              }}>
                Tu{' '}
                <span style={{ color: F.gold }}>Primera</span>{' '}
                Casa en
                <br />
                <em>Virginia o North Carolina</em>
              </h1>

              {/* Subheadline */}
              <p style={{
                fontSize: '17px',
                fontWeight: 300,
                color: 'rgba(255,255,255,0.80)',
                lineHeight: 1.65,
                margin: '0 0 28px',
              }}>
                La guía completa en español para familias hispanas
                que quieren comprar casa — sin perderse en el proceso,
                sin errores costosos y sin sentirse solos.
              </p>

              {/* Trust signals */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '32px' }}>
                {['100% Gratis', 'En Español', 'Virginia & NC'].map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={14} color={F.gold} />
                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.70)' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                className="funnel-hero-cta"
                onClick={scrollToForm}
                style={{
                  padding: '14px 28px',
                  borderRadius: '10px',
                  border: 'none',
                  background: F.gold,
                  color: F.navy,
                  fontWeight: 600,
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  transition: 'all 0.2s',
                }}
              >
                ↓ Quiero mi guía gratis
              </button>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.50)', marginTop: '10px' }}>
                Sin spam. Recibirás la guía en tu email en segundos.
              </p>
            </div>

            {/* Right column — book cover mockup */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                maxWidth: '280px',
                width: '100%',
                aspectRatio: '3/4',
                background: F.navyDark,
                borderRadius: '8px',
                borderLeft: `6px solid ${F.gold}`,
                boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
                transform: 'perspective(800px) rotateY(-8deg)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
              }}>
                {/* Book body */}
                <div style={{ flex: 1, padding: '28px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏡</div>
                    <h2 style={{
                      fontFamily: '"Cormorant Garamond", Georgia, serif',
                      fontSize: '24px',
                      fontWeight: 400,
                      color: F.white,
                      lineHeight: 1.25,
                      margin: '0 0 12px',
                    }}>
                      Tu Primera Casa en Virginia
                    </h2>
                    <div style={{ width: '40px', height: '2px', background: F.gold, marginBottom: '12px' }} />
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.60)', lineHeight: 1.5, margin: 0 }}>
                      Guía para familias hispanas
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.50)', margin: '0 0 2px' }}>Adriana Melendez</p>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: 0 }}>A&J Real Estate Group</p>
                  </div>
                </div>
                {/* Gold band */}
                <div style={{
                  background: F.gold,
                  color: F.navy,
                  textAlign: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.15em',
                  padding: '8px',
                  flexShrink: 0,
                }}>
                  DESCARGA GRATUITA · 2026
                </div>
              </div>

              {/* Rating */}
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div style={{ color: F.gold, fontSize: '16px', marginBottom: '4px' }}>★★★★★</div>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.70)', margin: 0 }}>
                  "La mejor guía que encontré"
                </p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>
                  Familia García, Virginia Beach
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 2 — FORMULARIO
      ═══════════════════════════════════════════════════════════════════════ */}
      <section ref={formRef} style={{ background: F.offWhite, padding: '64px 24px' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>
          {/* Header */}
          <h2 style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '28px',
            fontWeight: 400,
            color: F.navy,
            textAlign: 'center',
            margin: '0 0 8px',
          }}>
            Recibe tu guía gratis ahora
          </h2>
          <p style={{ fontSize: '15px', color: F.textMid, textAlign: 'center', margin: '0 0 32px' }}>
            Solo necesitamos un par de datos — te la enviamos al instante
          </p>

          {/* Card */}
          <div style={{
            background: F.white,
            borderRadius: '20px',
            boxShadow: F.shadowLg,
            padding: '40px',
          }}>
            {/* Progress indicator */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
              {[1, 2].map((n, i) => (
                <>
                  <div
                    key={n}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: step >= n ? F.gold : F.white,
                      border: `2px solid ${step >= n ? F.gold : F.grayMid}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: step >= n ? F.navy : F.textLight,
                      flexShrink: 0,
                      transition: 'all 0.2s',
                    }}
                  >
                    {n}
                  </div>
                  {i === 0 && (
                    <div style={{
                      flex: 1,
                      height: '2px',
                      background: step === 2 ? F.gold : F.grayMid,
                      margin: '0 8px',
                      transition: 'background 0.3s',
                    }} />
                  )}
                </>
              ))}
              <span style={{ fontSize: '12px', color: F.textLight, marginLeft: '10px', whiteSpace: 'nowrap' }}>
                Paso {step} de 2
              </span>
            </div>

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <div>
                <p style={{ fontSize: '16px', fontWeight: 500, color: F.navy, margin: '0 0 20px' }}>
                  Hola, ¿cómo te llamas?
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={fLabel}>Nombre *</label>
                  <input
                    className="funnel-input"
                    type="text"
                    placeholder="Tu nombre"
                    value={step1.firstName}
                    onChange={e => { setStep1(p => ({ ...p, firstName: e.target.value })); if (errors.firstName) setErrors(p => ({ ...p, firstName: undefined })) }}
                    style={errors.firstName ? fInputErr : fInput}
                  />
                  {errors.firstName && <p style={fErr}>{errors.firstName}</p>}
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={fLabel}>Email *</label>
                  <input
                    className="funnel-input"
                    type="email"
                    placeholder="tu@email.com"
                    value={step1.email}
                    onChange={e => { setStep1(p => ({ ...p, email: e.target.value })); if (errors.email) setErrors(p => ({ ...p, email: undefined })) }}
                    style={errors.email ? fInputErr : fInput}
                  />
                  {errors.email && <p style={fErr}>{errors.email}</p>}
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={fLabel}>Teléfono (opcional)</label>
                  <input
                    className="funnel-input"
                    type="tel"
                    placeholder="(757) 555-0000"
                    value={step1.phone}
                    onChange={e => setStep1(p => ({ ...p, phone: e.target.value }))}
                    style={fInput}
                  />
                </div>

                <button
                  className="funnel-step1-btn"
                  onClick={handleStep1Submit}
                  disabled={isStep1Disabled}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '16px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    border: 'none',
                    background: F.navy,
                    color: F.white,
                    cursor: isStep1Disabled ? 'not-allowed' : 'pointer',
                    opacity: isStep1Disabled ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    transition: 'all 0.2s',
                  }}
                >
                  Quiero mi guía gratis
                  <ArrowRight size={18} />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '12px' }}>
                  <Lock size={12} color={F.textLight} />
                  <span style={{ fontSize: '12px', color: F.textLight }}>
                    Tu información está segura. No spam, nunca.
                  </span>
                </div>
              </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
              <div className="step2-enter">
                <p style={{ fontSize: '16px', fontWeight: 500, color: F.navy, margin: '0 0 4px' }}>
                  ¡Casi lista, {step1.firstName}! 🎉
                </p>
                <p style={{ fontSize: '14px', color: F.textMid, margin: '0 0 20px' }}>
                  Una pregunta rápida para personalizar tu guía:
                </p>

                {/* Situation */}
                <p style={{ fontSize: '14px', fontWeight: 600, color: F.navy, margin: '0 0 10px' }}>
                  ¿Cuál es tu situación actual?
                </p>
                {[
                  { label: 'Estoy alquilando y quiero comprar', value: 'alquilando' },
                  { label: 'Vivo con familia o amigos', value: 'con_familia' },
                  { label: 'Tengo casa y quiero comprar otra', value: 'tengo_casa' },
                  { label: 'Solo estoy explorando opciones', value: 'otro' },
                ].map(opt => (
                  <RadioOption
                    key={opt.value}
                    label={opt.label}
                    value={opt.value}
                    selected={step2.situation === opt.value}
                    onSelect={v => setStep2(p => ({ ...p, situation: v }))}
                  />
                ))}

                {/* Timeline */}
                <p style={{ fontSize: '14px', fontWeight: 600, color: F.navy, margin: '20px 0 10px' }}>
                  ¿Cuándo planeas comprar?
                </p>
                {[
                  { label: 'En los próximos 3 meses', value: '0_3' },
                  { label: 'En 3 a 6 meses', value: '3_6' },
                  { label: 'En 6 a 12 meses', value: '6_12' },
                  { label: 'Todavía no lo sé', value: 'explorando' },
                ].map(opt => (
                  <RadioOption
                    key={opt.value}
                    label={opt.label}
                    value={opt.value}
                    selected={step2.timeline === opt.value}
                    onSelect={v => setStep2(p => ({ ...p, timeline: v }))}
                  />
                ))}

                {/* Budget */}
                <p style={{ fontSize: '14px', fontWeight: 600, color: F.navy, margin: '20px 0 10px' }}>
                  ¿Cuál sería tu rango de presupuesto?
                </p>
                {[
                  { label: 'Menos de $250,000', value: 'menos_250' },
                  { label: '$250,000 – $350,000', value: '250_350' },
                  { label: '$350,000 – $450,000', value: '350_450' },
                  { label: 'Más de $450,000', value: 'mas_450' },
                ].map(opt => (
                  <RadioOption
                    key={opt.value}
                    label={opt.label}
                    value={opt.value}
                    selected={step2.budget === opt.value}
                    onSelect={v => setStep2(p => ({ ...p, budget: v }))}
                  />
                ))}

                <button
                  className="funnel-step2-btn"
                  onClick={handleStep2Submit}
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '16px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    border: 'none',
                    background: F.gold,
                    color: F.navy,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    marginTop: '24px',
                    transition: 'all 0.2s',
                  }}
                >
                  <Download size={18} />
                  Descargar mi guía gratis
                </button>

                <button
                  onClick={() => setStep(1)}
                  style={{
                    display: 'block',
                    margin: '12px auto 0',
                    background: 'none',
                    border: 'none',
                    fontSize: '13px',
                    color: F.textLight,
                    cursor: 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  ← Volver
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 3 — QUÉ ENCONTRARÁS
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: F.gray, padding: '72px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '32px',
            fontWeight: 400,
            color: F.navy,
            textAlign: 'center',
            margin: '0 0 8px',
          }}>
            Lo que viene dentro de la guía
          </h2>
          <p style={{ fontSize: '15px', color: F.textMid, textAlign: 'center', margin: '0 0 40px' }}>
            23 páginas de información práctica — sin relleno, sin tecnicismos
          </p>

          <div
            className="funnel-content-grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
          >
            {contents.map(c => (
              <div
                key={c.number}
                className="funnel-content-block"
                style={{
                  background: F.white,
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: F.shadowSm,
                }}
              >
                <div style={{ marginBottom: '12px' }}>{CONTENT_ICONS[c.icon]}</div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: F.gold,
                  marginBottom: '8px',
                }}>
                  {c.number}
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: F.navy, margin: '0 0 6px', lineHeight: 1.4 }}>
                  {c.title}
                </h3>
                <p style={{ fontSize: '13px', color: F.textMid, lineHeight: 1.6, margin: 0 }}>
                  {c.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 4 — SOBRE ADRIANA
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: F.white, padding: '72px 24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div
            className="funnel-adriana-grid"
            style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '48px', alignItems: 'start' }}
          >
            {/* Photo placeholder */}
            <div style={{ position: 'relative' }}>
              <div style={{
                aspectRatio: '4/5',
                borderRadius: '16px',
                background: F.gray,
                border: `4px solid ${F.gold}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: F.textLight,
                fontSize: '14px',
                textAlign: 'center',
                padding: '20px',
                position: 'relative',
              }}>
                <span>Foto de Adriana<br />Melendez</span>
                {/* Badge */}
                <div style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: F.gold,
                  color: F.navy,
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  whiteSpace: 'nowrap',
                }}>
                  Top 7% Hampton Roads 2024
                </div>
              </div>
            </div>

            {/* Bio */}
            <div>
              <p style={{ fontSize: '11px', color: F.gold, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>
                Quién escribió esta guía
              </p>
              <h2 style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: '28px',
                fontWeight: 400,
                color: F.navy,
                margin: '0 0 20px',
              }}>
                Adriana Melendez
              </h2>
              <p style={{ fontSize: '15px', color: F.textMid, lineHeight: 1.75, margin: '0 0 16px' }}>
                Hola, soy Adriana Melendez.
              </p>
              <p style={{ fontSize: '15px', color: F.textMid, lineHeight: 1.75, margin: '0 0 16px' }}>
                Llegué a Virginia como muchas familias hispanas — con sueños grandes y muchas preguntas sin responder. Hoy soy agente inmobiliaria, madre de tres, y ayudo a familias como la tuya a encontrar su hogar en Virginia y North Carolina.
              </p>
              <p style={{ fontSize: '15px', color: F.textMid, lineHeight: 1.75, margin: '0 0 24px' }}>
                Esta guía es lo que hubiera querido tener cuando yo estaba buscando mi primera casa.
              </p>

              {/* Credentials */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {[
                  '📍 Virginia & North Carolina',
                  '⭐ Top 7% Hampton Roads',
                  '🏡 +100 familias ayudadas',
                  '🎖 Active Military Family',
                ].map(item => (
                  <div key={item} style={{ fontSize: '13px', color: F.textMid }}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 5 — TESTIMONIALES
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{ background: '#EEF2F8', padding: '72px 24px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '32px',
            fontWeight: 400,
            color: F.navy,
            textAlign: 'center',
            margin: '0 0 40px',
          }}>
            Familias que ya tienen su casa
          </h2>

          <div
            className="funnel-test-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}
          >
            {testimonials.map(t => (
              <div
                key={t.name}
                style={{
                  background: F.white,
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: F.shadowSm,
                }}
              >
                {/* Stars */}
                <div style={{ color: F.gold, fontSize: '18px', marginBottom: '12px' }}>
                  {'★'.repeat(t.stars)}
                </div>
                {/* Quote */}
                <p style={{ fontSize: '15px', color: F.textMid, lineHeight: 1.7, margin: '0 0 20px', position: 'relative' }}>
                  <span style={{
                    fontSize: '48px',
                    color: F.gold,
                    lineHeight: 0,
                    verticalAlign: '-0.4em',
                    marginRight: '4px',
                    fontFamily: 'Georgia, serif',
                  }}>"</span>
                  {t.quote}
                </p>
                {/* Author */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: F.navy,
                    color: F.white,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    fontWeight: 500,
                    flexShrink: 0,
                  }}>
                    {t.initial}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: F.navy, margin: 0 }}>{t.name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <MapPin size={12} color={F.textLight} />
                      <span style={{ fontSize: '12px', color: F.textLight }}>{t.location}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECCIÓN 6 — CTA FINAL
      ═══════════════════════════════════════════════════════════════════════ */}
      <section style={{
        background: 'linear-gradient(135deg, #1B2F5B 0%, #2A4580 100%)',
        padding: '72px 24px',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: '36px',
          fontWeight: 400,
          fontStyle: 'italic',
          color: F.white,
          margin: '0 0 12px',
        }}>
          ¿Lista para dar el primer paso?
        </h2>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', margin: '0 0 32px', lineHeight: 1.6 }}>
          Tu guía gratuita te espera.<br />
          Sin spam. Sin compromisos. Solo información que funciona.
        </p>
        <button
          className="funnel-cta-final"
          onClick={scrollToForm}
          style={{
            padding: '18px 40px',
            borderRadius: '10px',
            border: 'none',
            background: F.gold,
            color: F.navy,
            fontWeight: 600,
            fontSize: '18px',
            cursor: 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
            transition: 'all 0.2s',
          }}
        >
          ↓ Quiero mi guía gratis
        </button>
        <p style={{ fontSize: '13px', color: F.gold, marginTop: '20px' }}>
          Virginia · North Carolina · En Español
        </p>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════════════════════════ */}
      <footer style={{
        background: F.navyDark,
        padding: '24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.60)', margin: '0 0 6px' }}>
          A&J Real Estate Group
        </p>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)', margin: '0 0 10px', lineHeight: 1.7 }}>
          © 2026 A&J Real Estate Group · Virginia & North Carolina<br />
          Demo · contacto@example.com · (757) 555-0101
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          {['Política de privacidad', 'Cancelar suscripción'].map(link => (
            <a
              key={link}
              href="#"
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.40)', textDecoration: 'none' }}
            >
              {link}
            </a>
          ))}
        </div>
      </footer>
    </>
  )
}
