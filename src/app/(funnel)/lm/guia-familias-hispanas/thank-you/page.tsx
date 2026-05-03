import { CheckCircle2 } from 'lucide-react'

const F = {
  navy:     '#1B2F5B',
  gold:     '#C9A96E',
  white:    '#FFFFFF',
  offWhite: '#FAFAF8',
  grayMid:  '#E8E6E1',
  textMid:  '#4A5568',
  textLight:'#8A96A8',
}

export default function ThankYouPage() {
  return (
    <div
      style={{
        background: F.offWhite,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: '600px', width: '100%' }}>
        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <CheckCircle2 size={64} color={F.gold} strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            fontSize: '32px',
            fontWeight: 400,
            color: F.navy,
            textAlign: 'center',
            margin: '0 0 12px',
          }}
        >
          ¡Tu guía está en camino!
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '16px',
            color: F.textMid,
            lineHeight: 1.7,
            textAlign: 'center',
            margin: '0 0 40px',
          }}
        >
          Revisa tu email — en los próximos minutos recibirás{' '}
          <strong style={{ color: F.navy }}>"Tu Primera Casa en Virginia"</strong>{' '}
          directamente en tu bandeja de entrada.
        </p>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${F.grayMid}`, marginBottom: '32px' }} />

        {/* While you wait */}
        <p
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: F.navy,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: '20px',
          }}
        >
          Mientras esperas:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>📱</span>
            <div>
              <p style={{ fontSize: '14px', color: F.textMid, margin: 0, lineHeight: 1.6 }}>
                Síguenos en Instagram para tips diarios
              </p>
              <p style={{ fontSize: '13px', color: F.gold, margin: '2px 0 0', fontWeight: 500 }}>
                @adrysofi_realestate
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <span style={{ fontSize: '24px', flexShrink: 0 }}>📞</span>
            <div>
              <p style={{ fontSize: '14px', color: F.textMid, margin: '0 0 8px', lineHeight: 1.6 }}>
                ¿Quieres hablar con Adriana directamente?
              </p>
              <a
                href="#"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  background: F.navy,
                  color: F.white,
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

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${F.grayMid}`, marginBottom: '20px' }} />

        {/* Spam note */}
        <p style={{ fontSize: '13px', color: F.textLight, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
          No olvides revisar tu carpeta de spam si no lo ves en 5 minutos.
        </p>

        {/* Footer nav */}
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <a
            href="/lm/guia-familias-hispanas"
            style={{ fontSize: '13px', color: F.textLight, textDecoration: 'none' }}
          >
            ← Volver a la página
          </a>
        </div>
      </div>
    </div>
  )
}
