import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'ITMANO — El CRM con IA hecho sólo para bienes raíces',
  description:
    'La inteligencia artificial lee cada lead que entra, ordena tu lista del día y te dice qué decirle antes de llamar. Captación, seguimiento y propiedades en un solo lugar, con tu marca.',
  openGraph: {
    title: 'ITMANO — El CRM con IA hecho sólo para bienes raíces',
    description:
      'Abre el CRM y ya sabes a quién llamar hoy. Sin módulos que nunca abres, sin semanas de configuración.',
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
        /* Sólo el eje vertical: el atajo "padding: 96px 0" pisaba el padding
           lateral de .mk-container en los bloques que llevan las dos clases, y
           el contenido quedaba pegado al borde por debajo de 1168px. */
        .mk-section { padding-top: 96px; padding-bottom: 96px; scroll-margin-top: 72px; }
        .mk-section-tight { padding-top: 64px; padding-bottom: 64px; }
        /* Sección con fondo propio: el contenedor de los divisores y del backdrop. */
        .mk-band {
          position: relative; overflow: hidden;
          background-color: var(--bg-surface); scroll-margin-top: 72px;
        }

        /* ── Tipografía ───────────────────────────────────────────── */
        .mk-eyebrow {
          font-size: 11px; font-weight: 500; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--accent-gold);
        }
        .mk-h1 {
          font-size: clamp(34px, 5.2vw, 60px); font-weight: 300; line-height: 1.06;
          letter-spacing: -0.03em; color: var(--text-primary); max-width: 800px;
        }
        .mk-h2 {
          font-size: clamp(26px, 3.4vw, 36px); font-weight: 300; line-height: 1.18;
          letter-spacing: -0.02em; color: var(--text-primary);
        }
        .mk-lead { font-size: 17px; line-height: 1.65; color: var(--text-secondary); }
        .mk-body { font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
        .mk-num { font-variant-numeric: tabular-nums; }
        .mk-item-title { font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.35; }
        /* Bloque de párrafos bajo un H2 — el ancho de lectura de la landing. */
        .mk-prose { margin-top: 20px; max-width: 620px; display: flex; flex-direction: column; gap: 14px; }

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

        /* Insignia circular del ícono — el color se inyecta vía --glow-color
           desde el componente (uno por ítem, no todos dorados). */
        .mk-icon-badge {
          width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background-color: color-mix(in srgb, var(--glow-color, var(--accent-gold)) 14%, transparent);
          color: var(--glow-color, var(--accent-gold));
        }
        .mk-feature-card {
          transition: border-color var(--dur-base), box-shadow var(--dur-base);
        }
        .mk-feature-card:hover {
          border-color: color-mix(in srgb, var(--glow-color, var(--accent-gold)) 40%, var(--border-subtle));
          box-shadow: var(--highlight-top), 0 8px 24px color-mix(in srgb, var(--glow-color, var(--accent-gold)) 12%, transparent);
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
        /* Una sola columna: el titular manda, el video ocupa el ancho debajo. */
        .mk-hero { padding-top: 152px; padding-bottom: 96px; }
        .mk-hero-cta { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; }
        .mk-fineprint { margin-top: 14px; font-size: 13px; color: var(--text-secondary); }
        .mk-hero-video { position: relative; margin-top: 56px; }
        .mk-hero-video::before {
          content: ''; position: absolute; inset: -12% -6%; pointer-events: none;
          background: radial-gradient(ellipse 65% 55% at 50% 45%, color-mix(in srgb, var(--accent-gold) 9%, transparent), transparent 70%);
        }
        @media (max-width: 760px) {
          .mk-hero { padding-top: 116px; padding-bottom: 64px; }
          .mk-hero-video { margin-top: 40px; }
          .mk-hero-cta .mk-btn-gold, .mk-hero-cta .mk-btn-ghost { width: 100%; }
        }

        /* ── Video del producto ──────────────────────────────────── */
        .mk-video-frame {
          position: relative; aspect-ratio: 16 / 10; width: 100%;
          border-radius: 16px; overflow: hidden;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-subtle); border-top-color: var(--border-accent);
          box-shadow: var(--highlight-top), var(--shadow-lg);
        }
        .mk-video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .mk-video-fallback {
          width: 100%; height: 100%;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
          background-image: radial-gradient(ellipse 60% 60% at 50% 40%, var(--bg-elevated), var(--bg-surface) 70%);
        }
        .mk-video-fallback span {
          font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--text-muted);
        }

        /* ── El problema ─────────────────────────────────────────── */
        .mk-problems { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 40px; }
        .mk-problem { border-top: 1px solid var(--border-subtle); padding-top: 20px; }
        @media (max-width: 880px) { .mk-problems { grid-template-columns: 1fr; gap: 24px; } }

        /* ── Sección de IA ───────────────────────────────────────── */
        .mk-ia-layout {
          display: grid; grid-template-columns: 1fr 1fr; gap: 48px;
          align-items: start; margin-top: 48px;
        }
        .mk-ia-layout > * { min-width: 0; }
        @media (max-width: 900px) { .mk-ia-layout { grid-template-columns: 1fr; gap: 40px; } }
        .mk-ia-points { display: flex; flex-direction: column; gap: 26px; }
        .mk-point { display: flex; gap: 16px; align-items: flex-start; }

        /* Tarjeta de ejemplo del análisis */
        .mk-briefing {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border-subtle); border-top: 1px solid var(--border-accent);
          border-radius: 14px; padding: 22px;
          box-shadow: var(--highlight-top), var(--shadow-lg);
        }
        .mk-briefing-head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
          padding-bottom: 16px; border-bottom: 1px solid var(--border-subtle);
        }
        .mk-briefing-name { font-size: 15px; font-weight: 500; color: var(--text-primary); }
        .mk-briefing-source { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
        .mk-briefing-when {
          flex-shrink: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--accent-gold);
          border: 1px solid var(--border-accent); border-radius: 6px; padding: 4px 9px;
          background-color: color-mix(in srgb, var(--accent-gold) 8%, transparent);
        }
        .mk-briefing-block { margin-top: 16px; }
        .mk-briefing-label {
          display: block; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--text-muted); margin-bottom: 6px;
        }
        .mk-briefing-text { font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
        .mk-briefing-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .mk-briefing-list li {
          font-size: 13px; line-height: 1.55; color: var(--text-secondary);
          padding-left: 14px; position: relative;
        }
        .mk-briefing-list li::before {
          content: '·'; position: absolute; left: 2px; color: var(--accent-gold);
        }

        /* ── Grids de contenido ──────────────────────────────────── */
        .mk-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 40px; }
        @media (max-width: 820px) { .mk-grid-2 { grid-template-columns: 1fr; } }

        .mk-card {
          background-color: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 12px; padding: 24px;
        }

        /* ── Lo que no vas a encontrar ───────────────────────────── */
        .mk-absent { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; margin-top: 44px; }
        @media (max-width: 820px) { .mk-absent { grid-template-columns: 1fr; gap: 24px; } }
        .mk-absent-item { display: flex; gap: 14px; align-items: flex-start; }
        .mk-absent-mark {
          flex-shrink: 0; font-size: 15px; line-height: 1.35;
          color: var(--accent-coral); user-select: none;
        }

        .mk-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; }
        @media (max-width: 880px) { .mk-steps { grid-template-columns: 1fr; } }

        /* ── Inversión ───────────────────────────────────────────── */
        .mk-invest {
          display: grid; grid-template-columns: 1fr 380px; gap: 48px; align-items: center;
        }
        @media (max-width: 880px) { .mk-invest { grid-template-columns: 1fr; gap: 36px; } }
        .mk-invest-panel {
          border: 1px solid var(--border-gold-hover); border-radius: 14px;
          background-color: var(--bg-elevated);
          background-image: radial-gradient(circle at 25% -10%, color-mix(in srgb, var(--accent-gold) 13%, transparent), transparent 58%);
          box-shadow: var(--highlight-top), var(--shadow-lg);
          padding: 28px;
        }
        .mk-invest-link {
          display: block; margin-top: 16px; text-align: center;
          font-size: 13px; color: var(--accent-gold); text-decoration: none;
          transition: color var(--dur-fast);
        }
        .mk-invest-link:hover { color: var(--text-primary); }

        /* ── Contacto ────────────────────────────────────────────── */
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
