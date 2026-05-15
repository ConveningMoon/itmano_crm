import { CheckCircle2 } from 'lucide-react'
import Image from 'next/image'

const C = {
  navy:     '#1B2F5B',
  gold:     '#C9A96E',
  white:    '#FFFFFF',
  offWhite: '#FAFAF8',
  grayMid:  '#E2DDD8',
  textMid:  '#4A5568',
  textLight:'#8A96A8',
}

export default function ThankYouPage() {
  return (
    <div style={{
      background: C.offWhite,
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 24px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: '560px', width: '100%' }}>
        {/* Check icon */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <CheckCircle2 size={64} color={C.gold} strokeWidth={1.5} />
        </div>

        <h1 style={{
          fontFamily: '"Cormorant Garamond", Georgia, serif',
          fontSize: '36px',
          fontWeight: 400,
          color: C.navy,
          textAlign: 'center',
          margin: '0 0 12px',
        }}>
          ¡Tu guía está en camino!
        </h1>

        <p style={{ fontSize: '16px', color: C.textMid, lineHeight: 1.7, textAlign: 'center', margin: '0 0 40px' }}>
          Revisa tu email — en los próximos minutos recibirás{' '}
          <strong style={{ color: C.navy }}>"Tu Primera Casa en Virginia"</strong>{' '}
          directamente en tu bandeja de entrada.
        </p>

        <div style={{ borderTop: `1px solid ${C.grayMid}`, marginBottom: '32px' }} />

        <p style={{ fontSize: '13px', fontWeight: 600, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>
          Mientras esperas:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>📱</span>
            <div>
              <p style={{ fontSize: '14px', color: C.textMid, margin: '0 0 10px', lineHeight: 1.6 }}>
                Síguenos en Instagram para tips diarios sobre el mercado inmobiliario en Virginia
              </p>
              <a
                href="https://www.instagram.com/adrysofi_realestate"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '11px 20px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #E1306C, #833AB4)',
                  color: C.white,
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                IG @adrysofi_realestate →
              </a>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>📞</span>
            <div>
              <p style={{ fontSize: '14px', color: C.textMid, margin: '0 0 10px', lineHeight: 1.6 }}>
                ¿Quieres hablar con Adriana directamente? Agenda una consulta gratuita de 15 minutos.
              </p>
              <a
                href="#"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  background: C.navy,
                  color: C.white,
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Agendar consulta gratuita →
              </a>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.grayMid}`, marginBottom: '28px' }} />

        {/* Adriana mini */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: `3px solid ${C.gold}`, margin: '0 auto 12px', position: 'relative' }}>
            <Image src="/adri_face.JPG" alt="Adriana Melendez" width={80} height={80} style={{ objectFit: 'cover', objectPosition: 'top' }} />
          </div>
          <p style={{ fontSize: '14px', color: C.textMid, fontStyle: 'italic' }}>
            "Soy Adriana. Estoy aquí para ayudarte."
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${C.grayMid}`, marginBottom: '20px' }} />

        <p style={{ fontSize: '13px', color: C.textLight, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
          No olvides revisar tu carpeta de spam si no lo ves en 5 minutos.
        </p>

        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <a href="/lm/guia-familias-hispanas" style={{ fontSize: '13px', color: C.textLight, textDecoration: 'none' }}>
            ← Volver a la página
          </a>
        </div>
      </div>
    </div>
  )
}
