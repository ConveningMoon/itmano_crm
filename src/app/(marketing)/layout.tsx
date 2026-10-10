import type { Metadata } from 'next'
import { Bodoni_Moda } from 'next/font/google'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'ITMANO — El CRM con IA hecho sólo para bienes raíces',
  description:
    'La inteligencia artificial lee cada lead que entra, ordena tu lista del día y te dice qué decirle antes de llamar. Captación, seguimiento, newsletters, open houses y propiedades en un solo lugar, con tu marca.',
  openGraph: {
    title: 'ITMANO — El CRM con IA hecho sólo para bienes raíces',
    description:
      'Abre el CRM y ya sabes a quién llamar hoy. Sin módulos que nunca abres, sin semanas de configuración.',
    images: ['/itmano_banner.webp'],
  },
}

// Voz display de las páginas públicas: una Didone de óptica variable, la
// tradición tipográfica de los folletos inmobiliarios de lujo. Sólo titulares
// y cifras grandes; el texto corrido y la interfaz siguen en Inter. Se
// autohospeda con next/font y sólo carga en las rutas (marketing).
const display = Bodoni_Moda({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-display',
  display: 'swap',
})

// Layout público de marketing: nav fijo + contenido + footer. Comparte los
// tokens del design system del CRM (globals.css) — una sola identidad visual.
// Las clases .mk-* compartidas viven aquí (unlayered, misma inmunidad de
// cascada que las reglas de app-shell en globals.css); las propias de la home
// están en (marketing)/landing.css y sólo carga esa página.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} mk-root`} style={{ backgroundColor: 'var(--bg-base)', minHeight: '100vh', overflowX: 'clip' }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          html { scroll-behavior: smooth; }
        }

        /* ── Superficies del navegador ───────────────────────────── */
        html:has(.mk-root) { color-scheme: dark; scrollbar-color: var(--bg-overlay) var(--bg-base); }
        .mk-root ::selection { background-color: color-mix(in srgb, var(--accent-gold) 34%, transparent); color: var(--text-primary); }
        .mk-root :focus-visible { outline: 2px solid var(--accent-gold); outline-offset: 3px; border-radius: 4px; }
        .mk-root a { text-underline-offset: 3px; }

        .mk-container { max-width: 1180px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
        /* Sólo el eje vertical: el atajo "padding: 96px 0" pisaba el padding
           lateral de .mk-container en los bloques que llevan las dos clases, y
           el contenido quedaba pegado al borde por debajo de 1168px. */
        .mk-section { padding-top: 120px; padding-bottom: 120px; scroll-margin-top: 72px; }
        .mk-section-tight { padding-top: 64px; padding-bottom: 64px; }
        @media (max-width: 760px) { .mk-section { padding-top: 88px; padding-bottom: 88px; } }
        /* Sección con fondo propio: el contenedor de los divisores y del backdrop.
           clip y no hidden: hidden la convierte en contenedor de scroll y un
           position: sticky adentro (el recorrido) dejaría de pegarse al viewport. */
        .mk-band {
          position: relative; overflow: clip;
          background-color: var(--bg-surface); scroll-margin-top: 72px;
        }

        /* ── Tipografía ───────────────────────────────────────────── */
        .mk-eyebrow {
          font-size: 11px; font-weight: 500; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--accent-gold);
        }
        .mk-display, .mk-h1, .mk-h2 {
          font-family: var(--font-display), Georgia, serif;
          font-optical-sizing: auto; font-weight: 400;
          color: var(--text-primary); text-wrap: balance;
        }
        .mk-display {
          font-size: clamp(44px, 6.4vw, 88px); line-height: 1.02; letter-spacing: -0.025em;
        }
        .mk-h1 {
          font-size: clamp(36px, 5.2vw, 64px); line-height: 1.05;
          letter-spacing: -0.02em; max-width: 800px;
        }
        .mk-h2 {
          font-size: clamp(32px, 4.2vw, 54px); line-height: 1.08; letter-spacing: -0.02em;
        }
        .mk-h3 { font-size: 19px; font-weight: 500; line-height: 1.3; color: var(--text-primary); letter-spacing: -0.005em; }
        .mk-lead { font-size: 18px; line-height: 1.6; color: var(--text-secondary); text-wrap: pretty; }
        .mk-body { font-size: 15px; line-height: 1.65; color: var(--text-secondary); text-wrap: pretty; }
        .mk-num { font-variant-numeric: tabular-nums; }
        .mk-gold { color: var(--accent-gold); }
        .mk-item-title { font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.35; }

        /* Texto en degradé — se usa con extrema mesura: 1–2 palabras por página,
           nunca un párrafo entero (deja de leerse como énfasis si todo brilla). */
        .mk-gradient-text {
          font-weight: 600;
          background-image: linear-gradient(100deg, var(--accent-gold) 10%, var(--accent-coral) 55%, var(--accent-blue) 100%);
          background-clip: text; -webkit-background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
        }

        /* Línea divisoria de degradé — marca el cambio de sección con color. */
        .mk-divider-gradient {
          height: 1px; width: 100%;
          background-image: linear-gradient(90deg, transparent, var(--accent-blue) 20%, var(--accent-gold) 50%, var(--accent-coral) 80%, transparent);
          opacity: 0.4;
        }

        /* ── Botones ─────────────────────────────────────────────── */
        .mk-btn-gold {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px 24px; border-radius: 8px; border: none;
          background-color: var(--accent-gold); color: var(--bg-base);
          font-size: 14px; font-weight: 600; letter-spacing: 0.02em;
          cursor: pointer; text-decoration: none; white-space: nowrap;
        }
        .mk-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px 24px; border-radius: 8px;
          border: 1px solid var(--border-hover);
          background-color: transparent; color: var(--text-primary);
          font-size: 14px; font-weight: 500; letter-spacing: 0.02em;
          cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: border-color var(--dur-fast), background-color var(--dur-fast);
        }
        .mk-btn-ghost:hover { border-color: var(--border-gold-hover); background-color: var(--bg-elevated); }

        /* ── Nav ─────────────────────────────────────────────────── */
        .mk-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          border-bottom: 1px solid transparent;
          transition: background-color var(--dur-base), border-color var(--dur-base), backdrop-filter var(--dur-base);
        }
        .mk-nav-scrolled {
          background-color: color-mix(in srgb, var(--bg-base) 82%, transparent);
          backdrop-filter: blur(12px);
          border-bottom-color: var(--border-subtle);
        }
        .mk-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 68px; }
        .mk-nav-links { display: flex; align-items: center; gap: 28px; }
        .mk-nav-link {
          font-size: 13px; color: var(--text-secondary); text-decoration: none;
          transition: color var(--dur-fast);
        }
        .mk-nav-link:hover { color: var(--text-primary); }
        .mk-nav-actions { display: flex; align-items: center; gap: 12px; }
        .mk-burger { display: none; }
        @media (max-width: 920px) {
          .mk-nav-links { display: none; }
          .mk-nav-actions .mk-btn-ghost { display: none; }
          .mk-burger { display: inline-flex; }
        }

        /* ── Contenedores y formulario ───────────────────────────── */
        .mk-card {
          background-color: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px; padding: 24px;
        }
        .mk-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .mk-form-row { grid-template-columns: 1fr; } }

        .mk-input {
          width: 100%; padding: 12px 13px; border-radius: 8px;
          border: 1px solid var(--border-subtle); background-color: var(--bg-elevated);
          color: var(--text-primary); font-size: 15px; font-family: var(--font-sans);
          box-sizing: border-box; transition: border-color var(--dur-fast);
          caret-color: var(--accent-gold);
        }
        .mk-input::placeholder { color: var(--text-muted); }
        .mk-input:focus { border-color: var(--border-gold-hover); outline: none; }
        .mk-label {
          display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
          color: var(--text-muted); margin-bottom: 6px;
        }

        /* ── Footer ──────────────────────────────────────────────── */
        .mk-footer { border-top: 1px solid var(--border-subtle); padding: 48px 0 32px; }
        .mk-footer-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 32px; flex-wrap: wrap;
        }
        .mk-footer-link {
          font-size: 13px; color: var(--text-secondary); text-decoration: none;
          transition: color var(--dur-fast);
        }
        .mk-footer-link:hover { color: var(--text-primary); }
      `}</style>

      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  )
}
