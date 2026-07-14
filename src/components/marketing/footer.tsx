import Image from 'next/image'
import Link from 'next/link'

export function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-container">
        <div className="mk-footer-top">
          <div style={{ maxWidth: '320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Image
                src="/itmano_logo.webp"
                alt="ITMANO"
                width={26}
                height={26}
                className="img-tint-gold"
                style={{ display: 'block' }}
              />
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.2em',
                  color: 'var(--text-primary)',
                }}
              >
                ITMANO
              </span>
            </div>
            <p className="mk-body" style={{ fontSize: '13px' }}>
              Infraestructura de crecimiento para equipos inmobiliarios: adquisición,
              calificación, nurturing y conversión en una sola plataforma.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '56px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span className="mk-label" style={{ marginBottom: '2px' }}>Plataforma</span>
              <Link href="/#producto" className="mk-footer-link">Producto</Link>
              <Link href="/#inversion" className="mk-footer-link">Inversión</Link>
              <Link href="/#contacto" className="mk-footer-link">Contáctanos</Link>
              <Link href="/login" className="mk-footer-link">Iniciar sesión</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span className="mk-label" style={{ marginBottom: '2px' }}>Legal</span>
              <Link href="/terminos" className="mk-footer-link">Términos del servicio</Link>
              <Link href="/privacidad" className="mk-footer-link">Política de privacidad</Link>
              <Link href="/reembolsos" className="mk-footer-link">Política de reembolsos</Link>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '40px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} ITMANO. Todos los derechos reservados.
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            GROWTH PARTNER PLATFORM
          </span>
        </div>
      </div>
    </footer>
  )
}
