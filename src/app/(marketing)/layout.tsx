import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'ITMANO — Infraestructura de crecimiento para equipos inmobiliarios',
  description:
    'CRM multi-equipo con scoring automático de leads, secuencias de email con IA, propiedades sincronizadas con tu web y analytics en tiempo real. La plataforma Growth Partner de ITMANO.',
  openGraph: {
    title: 'ITMANO — Growth Partner Platform',
    description:
      'Captura, califica y madura a cada lead automáticamente. Tu equipo, enfocado en los que ya están calientes.',
    images: ['/itmano_banner.webp'],
  },
}

// Layout público de marketing: nav fijo + contenido + footer. Comparte los
// tokens del design system del CRM (globals.css) — una sola identidad visual.
// Las clases .mk-* viven aquí (unlayered, misma inmunidad de cascada que las
// reglas de app-shell en globals.css) y solo cargan en las rutas (marketing).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: 'var(--bg-base)', minHeight: '100vh' }}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          html { scroll-behavior: smooth; }
        }

        .mk-container { max-width: 1120px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
        .mk-section { padding: 96px 0; scroll-margin-top: 72px; }
        .mk-section-tight { padding: 56px 0; }

        /* ── Tipografía ───────────────────────────────────────────── */
        .mk-eyebrow {
          font-size: 11px; font-weight: 500; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--accent-gold);
        }
        .mk-h1 {
          font-size: clamp(34px, 5.2vw, 58px); font-weight: 300; line-height: 1.08;
          letter-spacing: -0.025em; color: var(--text-primary);
        }
        .mk-h1 strong { font-weight: 500; }
        .mk-h2 {
          font-size: clamp(26px, 3.4vw, 36px); font-weight: 300; line-height: 1.15;
          letter-spacing: -0.02em; color: var(--text-primary);
        }
        .mk-lead { font-size: 16px; line-height: 1.65; color: var(--text-secondary); }
        .mk-body { font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
        .mk-num { font-variant-numeric: tabular-nums; }

        /* ── Botones ─────────────────────────────────────────────── */
        .mk-btn-gold {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 24px; border-radius: 8px; border: none;
          background-color: var(--accent-gold); color: var(--bg-base);
          font-size: 13px; font-weight: 600; letter-spacing: 0.05em;
          cursor: pointer; text-decoration: none; white-space: nowrap;
        }
        .mk-btn-ghost {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px 24px; border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background-color: transparent; color: var(--text-primary);
          font-size: 13px; font-weight: 500; letter-spacing: 0.05em;
          cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: border-color var(--dur-fast), background-color var(--dur-fast);
        }
        .mk-btn-ghost:hover { border-color: var(--border-hover); background-color: var(--bg-elevated); }

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

        /* ── Hero ────────────────────────────────────────────────── */
        .mk-hero {
          display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: center;
          padding-top: 148px; padding-bottom: 96px;
        }
        @media (max-width: 980px) {
          .mk-hero { grid-template-columns: 1fr; gap: 48px; padding-top: 120px; padding-bottom: 64px; }
        }

        /* ── Franja de métricas ──────────────────────────────────── */
        .mk-stats {
          display: grid; grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle);
        }
        .mk-stat { padding: 28px 20px; border-left: 1px solid var(--border-subtle); }
        .mk-stat:first-child { border-left: none; }
        @media (max-width: 760px) {
          .mk-stats { grid-template-columns: 1fr 1fr; }
          .mk-stat:nth-child(3) { border-left: none; }
          .mk-stat:nth-child(n+3) { border-top: 1px solid var(--border-subtle); }
        }

        /* ── Grids de contenido ──────────────────────────────────── */
        .mk-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 920px) { .mk-grid-3 { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 620px) { .mk-grid-3 { grid-template-columns: 1fr; } }

        .mk-card {
          background-color: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px; padding: 24px;
        }

        .mk-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        @media (max-width: 760px) { .mk-steps { grid-template-columns: 1fr; } }

        .mk-pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
        @media (max-width: 920px) { .mk-pricing { grid-template-columns: 1fr; max-width: 480px; margin: 0 auto; } }

        .mk-contact { display: grid; grid-template-columns: 1fr 1.2fr; gap: 56px; }
        @media (max-width: 880px) { .mk-contact { grid-template-columns: 1fr; gap: 40px; } }
        .mk-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .mk-form-row { grid-template-columns: 1fr; } }

        .mk-input {
          width: 100%; padding: 11px 12px; border-radius: 8px;
          border: 1px solid var(--border-subtle); background-color: var(--bg-elevated);
          color: var(--text-primary); font-size: 13px; font-family: var(--font-sans);
          box-sizing: border-box; transition: border-color var(--dur-fast);
        }
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
