import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { Reveal } from '@/components/marketing/reveal'
import { Backdrop } from '@/components/marketing/backdrop'
import { PLANS, PLAN_ORDER, TRIAL } from '@/lib/plans'
import { buildPlanRows, type CellValue, type CompareGroup } from '@/lib/marketing/plan-rows'
import { PricingTable } from './pricing-table'

export const metadata: Metadata = {
  title: 'Planes e inversión — ITMANO',
  description:
    'Compara Esencial, Growth y Partner en detalle — capacidad, IA incluida y acompañamiento — y mira cómo se posiciona ITMANO frente al resto del mercado de CRM inmobiliarios.',
}

// ─── Datos de la comparativa de planes ────────────────────────────────────────
// Las filas las arma buildPlanRows() (src/lib/marketing/plan-rows.ts) a partir
// de PLANS, la fuente única: aquí no se escribe ningún tope a mano.

const COMPARISON = buildPlanRows()

// ─── ITMANO vs. el mercado ────────────────────────────────────────────────────
// Precios públicos aproximados (julio 2026) según los sitios y comparativas
// públicas de cada proveedor. El disclaimer visible acompaña la tabla. Los
// logos son favicons públicos de cada marca (public/competitors/) usados como
// referencia nominativa en la comparación.

const MARKET_COLUMNS: { name: string; logo: string | null }[] = [
  { name: 'ITMANO',         logo: null }, // usa el logo propio con tinte dorado
  { name: 'Follow Up Boss', logo: '/competitors/followupboss.png' },
  { name: 'Wise Agent',     logo: '/competitors/wiseagent.png' },
  { name: 'Lofty',          logo: '/competitors/lofty.png' },
  { name: 'BoldTrail',      logo: '/competitors/boldtrail.png' },
]

const MARKET_ROWS: { label: string; values: [CellValue, CellValue, CellValue, CellValue, CellValue] }[] = [
  {
    label: 'Inversión de entrada',
    values: [`$${PLANS.esencial.priceUsd} /mes`, '~$69 /usuario/mes', '~$49 /mes', 'desde ~$449 /mes', 'desde ~$499 /asiento/mes'],
  },
  {
    label: 'IA generativa incluida (correos, secuencias, documentos)',
    values: ['Incluida en todos los planes', 'Parcial', false, 'En suite', 'En suite'],
  },
  {
    label: 'Lo deja configurado el proveedor, no tú',
    values: [true, false, false, 'Parcial', 'Parcial'],
  },
  {
    label: 'Tu web de propiedades alimentada por el CRM',
    values: ['Growth y Partner', false, false, 'IDX (EE.UU.)', 'IDX (EE.UU.)'],
  },
  {
    label: 'Asignación de leads por idioma (español, inglés, portugués)',
    values: [true, false, false, false, false],
  },
  {
    label: 'Producto nativo en español',
    values: [true, false, false, false, false],
  },
  {
    label: 'Acceso propio para cada agente',
    values: ['Partner', true, true, true, true],
  },
  {
    label: 'Período de prueba con acceso completo',
    values: [`${TRIAL.days} días (nivel ${PLANS[TRIAL.plan].label})`, '14 días', '14 días', 'Demo', 'Demo'],
  },
]

// ─── Celda ✓ / — / texto ──────────────────────────────────────────────────────

function Cell({ value }: { value: CellValue }) {
  if (value === true) {
    return <Check size={16} strokeWidth={2} style={{ color: 'var(--accent-green)' }} aria-label="Incluido" />
  }
  if (value === false) {
    return <Minus size={14} strokeWidth={2} style={{ color: 'var(--text-muted)' }} aria-label="No incluido" />
  }
  return <span>{value}</span>
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function PlanesPage() {
  return (
    <>
      <style>{`
        .pl-table-wrap { overflow-x: auto; border: 1px solid var(--border-subtle); border-radius: 12px; background-color: var(--bg-surface); }
        .pl-table { width: 100%; border-collapse: collapse; min-width: 680px; }
        .pl-table th, .pl-table td {
          padding: 12px 16px; text-align: left; font-size: 13px; line-height: 1.5;
          border-top: 1px solid var(--border-subtle); vertical-align: middle;
        }
        .pl-table thead th { border-top: none; padding-top: 18px; padding-bottom: 14px; }
        .pl-table td:first-child { color: var(--text-secondary); width: 34%; }
        .pl-table td:not(:first-child), .pl-table th:not(:first-child) { text-align: center; color: var(--text-primary); }
        .pl-col-growth { background-color: color-mix(in srgb, var(--accent-gold) 6%, transparent); }
        .pl-group-row td {
          background-color: var(--bg-elevated); color: var(--text-primary) !important;
          font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
          padding-top: 10px; padding-bottom: 10px;
        }
        .pl-plan-name { font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
        .pl-plan-price { font-size: 13px; color: var(--text-secondary); font-weight: 400; margin-top: 4px; }
      `}</style>

      {/* Encabezado */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <Backdrop intensity={0.55} />
        <div className="mk-container" style={{ position: 'relative', paddingTop: '148px', paddingBottom: '24px' }}>
          <Reveal>
            <span className="mk-eyebrow">Inversión</span>
            <h1 className="mk-h1" style={{ marginTop: '16px', maxWidth: '720px', fontSize: 'clamp(32px, 4.6vw, 52px)' }}>
              Compara los planes — y compáranos con{' '}
              <span className="mk-gradient-text">el mercado</span>
            </h1>
            <p className="mk-lead" style={{ marginTop: '20px', maxWidth: '560px' }}>
              Esencial y Growth están pensados para agentes independientes; Partner,
              para equipos donde cada agente necesita su propio acceso. Todos
              incluyen lo mismo por dentro: la calificación de cada lead, el análisis
              con IA y las secuencias de correo.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '28px', flexWrap: 'wrap' }}>
              <Link href="/#contacto" className="mk-btn-gold btn-cta">Empieza tu prueba de {TRIAL.days} días</Link>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>100% gratis</strong>
                {' '}· sin tarjeta de crédito · experiencia {PLANS[TRIAL.plan].label} completa
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Comparativa de planes */}
      <section className="mk-container mk-section" style={{ paddingTop: '56px' }}>
        <Reveal>
          <PricingTable>
            {COMPARISON.map(group => (
              <FragmentGroup key={group.title} group={group} />
            ))}
          </PricingTable>
          <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Los correos y la IA se miden por mes calendario; los leads y las
            propiedades son totales. Te avisamos al acercarte al límite (en leads,
            desde el 80 %). El envío automático se pausa al llegar al tope del mes
            y se reanuda al subir de plan o al mes siguiente. Los leads que entran
            por tus formularios nunca se pierden.
          </p>
          <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Los impuestos correspondientes se calculan al momento de completar tu inversión.
          </p>
        </Reveal>

        {/* Por qué Growth */}
        <Reveal>
          <div
            className="mk-card"
            style={{
              marginTop: '48px',
              padding: '32px',
              borderTop: '1px solid var(--border-accent)',
              backgroundImage:
                'radial-gradient(circle at 20% -20%, color-mix(in srgb, var(--accent-gold) 10%, transparent), transparent 55%)',
            }}
          >
            <span className="mk-eyebrow">Por qué Growth</span>
            <h2 className="mk-h2" style={{ marginTop: '12px', fontSize: 'clamp(22px, 2.6vw, 28px)' }}>
              El punto donde el CRM se paga solo
            </h2>
            <p className="mk-body" style={{ marginTop: '12px', maxWidth: '640px' }}>
              Un agente independiente serio hoy junta piezas sueltas: un CRM
              (~$69/mes), una herramienta de IA para redactar (~$30/mes) y otra de
              correo (~$30/mes) — más de $129 al mes en cosas que no se hablan entre
              sí. Growth las reúne en un solo lugar, donde la calificación de tus
              leads, la IA y tu web de propiedades trabajan sobre la misma
              información. Y con la comisión de una sola operación cerrada, la
              inversión del año entero queda cubierta.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ITMANO vs. el mercado */}
      <section
        style={{
          position: 'relative',
          backgroundColor: 'var(--bg-surface)',
          overflow: 'hidden',
        }}
      >
        <div className="mk-divider-gradient" style={{ position: 'absolute', top: 0 }} />
        <div className="mk-container mk-section">
          <Reveal>
            <span className="mk-eyebrow">ITMANO vs. el mercado</span>
            <h2 className="mk-h2" style={{ marginTop: '14px', maxWidth: '600px' }}>
              Lo que en otros sistemas es un extra, aquí viene incluido
            </h2>
            <p className="mk-body" style={{ marginTop: '14px', maxWidth: '600px' }}>
              Comparamos contra los sistemas más usados del mercado en 2026. Los
              suites de equipo (Lofty, BoldTrail) son excelentes — a partir de ~$449
              al mes. ITMANO trae la misma clase de automatización e IA a la
              inversión de un agente independiente.
            </p>
          </Reveal>
          <Reveal>
            <div className="pl-table-wrap" style={{ marginTop: '36px' }}>
              <table className="pl-table" style={{ minWidth: '860px' }}>
                <thead>
                  <tr>
                    <th />
                    {MARKET_COLUMNS.map((c, i) => (
                      <th key={c.name} className={i === 0 ? 'pl-col-growth' : undefined}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          {i === 0 ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src="/itmano_logo.webp" alt="" aria-hidden width={28} height={28} className="img-tint-gold" style={{ display: 'block' }} />
                          ) : c.logo ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={c.logo}
                              alt=""
                              aria-hidden
                              width={28}
                              height={28}
                              style={{ display: 'block', borderRadius: '6px', background: 'var(--bg-elevated)', padding: '2px', boxSizing: 'content-box' }}
                            />
                          ) : null}
                          <div className="pl-plan-name" style={{ color: i === 0 ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                            {c.name}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MARKET_ROWS.map(row => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className={i === 0 ? 'pl-col-growth' : undefined}>
                          <Cell value={v} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '760px' }}>
              Precios y características públicos aproximados a julio de 2026, tomados
              de los sitios y comparativas públicas de cada proveedor; pueden cambiar
              sin aviso. Follow Up Boss, Wise Agent, Lofty y BoldTrail son marcas de
              sus respectivos dueños; ITMANO no está afiliado a ninguna de ellas.
            </p>
          </Reveal>

          {/* CTA final */}
          <Reveal>
            <div style={{ marginTop: '56px', textAlign: 'center' }}>
              <h2 className="mk-h2" style={{ fontSize: 'clamp(22px, 2.6vw, 30px)' }}>
                Pruébalo <span className="mk-gradient-text">gratis</span> con tus propios leads
              </h2>
              <p className="mk-body" style={{ marginTop: '12px' }}>
                {TRIAL.days} días con todo el sistema al nivel {PLANS[TRIAL.plan].label} —
                totalmente gratis, sin tarjeta de crédito.
              </p>
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/#contacto" className="mk-btn-gold btn-cta">Empieza tu prueba</Link>
                <Link href="/#ia" className="mk-btn-ghost">Ver cómo funciona</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

// Grupo de filas con su encabezado de categoría. Extraído para mantener la
// tabla legible; sigue siendo Server Component.
function FragmentGroup({ group }: { group: CompareGroup }) {
  return (
    <>
      <tr className="pl-group-row">
        <td colSpan={4}>{group.title}</td>
      </tr>
      {group.rows.map(row => (
        <tr key={row.label}>
          <td>{row.label}</td>
          {row.values.map((v, i) => (
            <td key={i} className={PLAN_ORDER[i] === 'growth' ? 'pl-col-growth' : undefined}>
              <Cell value={v} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
