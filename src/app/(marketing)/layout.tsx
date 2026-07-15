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
    <div style={{ backgroundColor: 'var(--bg-base)', minHeight: '100vh', overflowX: 'hidden' }}>
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
          font-size: clamp(36px, 5.6vw, 62px); font-weight: 300; line-height: 1.06;
          letter-spacing: -0.03em; color: var(--text-primary);
        }
        .mk-h1 strong { font-weight: 600; }
        .mk-h2 {
          font-size: clamp(26px, 3.4vw, 36px); font-weight: 300; line-height: 1.15;
          letter-spacing: -0.02em; color: var(--text-primary);
        }
        .mk-lead { font-size: 17px; line-height: 1.65; color: var(--text-secondary); }
        .mk-body { font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
        .mk-num { font-variant-numeric: tabular-nums; }

        /* Texto en degradé — se usa con extrema mesura: 1–2 palabras por página,
           nunca un párrafo entero (deja de leerse como énfasis si todo brilla). */
        .mk-gradient-text {
          font-weight: 600;
          background-image: linear-gradient(100deg, var(--accent-gold) 10%, var(--accent-coral) 55%, var(--accent-blue) 100%);
          background-clip: text; -webkit-background-clip: text;
          color: transparent; -webkit-text-fill-color: transparent;
        }

        /* Línea divisoria de degradé — reemplaza el border-top plano en puntos
           donde vale la pena marcar el cambio de sección con color. */
        .mk-divider-gradient {
          height: 1px; width: 100%;
          background-image: linear-gradient(90deg, transparent, var(--accent-blue) 20%, var(--accent-gold) 50%, var(--accent-coral) 80%, transparent);
          opacity: 0.4;
        }

        /* Insignia circular del ícono de cada feature — el color se inyecta vía
           --glow-color desde el componente (una por feature, no todas doradas). */
        .mk-icon-badge {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background-color: color-mix(in srgb, var(--glow-color, var(--accent-gold)) 14%, transparent);
          color: var(--glow-color, var(--accent-gold));
        }
        .mk-feature-card {
          transition: border-color var(--dur-base), box-shadow var(--dur-base), transform var(--dur-base);
        }
        .mk-feature-card:hover {
          border-color: color-mix(in srgb, var(--glow-color, var(--accent-gold)) 45%, var(--border-subtle));
          box-shadow: var(--highlight-top), 0 10px 28px color-mix(in srgb, var(--glow-color, var(--accent-gold)) 16%, transparent);
          transform: translateY(-2px);
        }

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
        /* Sin esto, los grid items no encogen bajo el ancho intrínseco de su
           contenido (min-width:auto por defecto) — el tablero del pipeline
           empujaba la página entera a scroll horizontal en móvil. */
        .mk-hero > * { min-width: 0; }
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
