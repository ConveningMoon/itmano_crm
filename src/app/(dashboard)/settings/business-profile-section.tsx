'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, AlertTriangle, AlertCircle } from 'lucide-react'
import {
  CURRENCY_SYMBOL, budgetTierFor, expectedCommission, formatMoney, missingFields,
  type BusinessProfile, type Currency, type CommissionModel,
} from '@/lib/business/profile'
import { saveBusinessProfile } from './actions'
import { TimeZoneSelect } from '@/components/dashboard/time-zone-select'
import { inferTimeZoneFromAreas, timeZoneLabel } from '@/lib/time-zones'
import { SettingsCard, SettingsRow, SettingsSectionHead } from '@/components/ui/settings-row'
import { InfoHint } from '@/components/ui/info-hint'

// Copy exacto (no se arma con JSX + `{'{slug}'}` intercalado a propósito: la
// forma en que JSX pliega espacios en blanco entre texto y expresiones es
// fácil de descuadrar por un espacio de más o de menos, y este texto tiene que
// ser literal).
const CANONICAL_HELP = 'Si publicas las ediciones en tu propio sitio, escribe aquí su dirección '
  + 'usando {slug} donde va el identificador de la edición. Ejemplo: '
  + 'https://tusitio.com/newsletter/{slug}. Al configurarlo, los buscadores tratarán tu web '
  + 'como el original y a la página de ITMANO como una copia, que es lo que hace que el '
  + 'posicionamiento se acumule en tu dominio.'

// El formulario ES la documentación: lo que aparece aquí es exactamente lo que
// el CRM necesita saber del negocio del cliente, ni más ni menos. Por eso cada
// bloque dice para qué sirve el dato (detrás de su InfoHint) en vez de
// limitarse a pedirlo.

type Draft = {
  currency:         Currency | ''
  commissionModel:  CommissionModel | ''
  commissionBuy:    string
  commissionSell:   string
  budgetEntryMax:   string
  budgetPremiumMin: string
  primaryAreas:     string
  secondaryAreas:   string
  timezone:         string
  publicSiteUrl:               string
  newsletterCanonicalTemplate: string
}

function toDraft(p: BusinessProfile): Draft {
  const n = (v: number | null) => (v === null ? '' : String(v))
  return {
    currency:         p.currency ?? '',
    commissionModel:  p.commissionModel ?? '',
    commissionBuy:    n(p.commissionBuy),
    commissionSell:   n(p.commissionSell),
    budgetEntryMax:   n(p.budgetEntryMax),
    budgetPremiumMin: n(p.budgetPremiumMin),
    primaryAreas:     p.primaryAreas.join(', '),
    secondaryAreas:   p.secondaryAreas.join(', '),
    timezone:         p.timezone ?? '',
    publicSiteUrl:               p.publicSiteUrl ?? '',
    newsletterCanonicalTemplate: p.newsletterCanonicalTemplate ?? '',
  }
}

/** "Virginia Beach, Norfolk" → ['Virginia Beach', 'Norfolk']. */
function parseAreas(raw: string): string[] {
  return raw.split(',').map(z => z.trim()).filter(z => z.length > 0).slice(0, 30)
}

function toProfile(d: Draft): BusinessProfile {
  const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  return {
    currency:         d.currency || null,
    commissionModel:  d.commissionModel || null,
    commissionBuy:    n(d.commissionBuy),
    commissionSell:   n(d.commissionSell),
    budgetEntryMax:   n(d.budgetEntryMax),
    budgetPremiumMin: n(d.budgetPremiumMin),
    primaryAreas:     parseAreas(d.primaryAreas),
    secondaryAreas:   parseAreas(d.secondaryAreas),
    timezone:         d.timezone || null,
    publicSiteUrl:               d.publicSiteUrl.trim() === '' ? null : d.publicSiteUrl.trim(),
    newsletterCanonicalTemplate: d.newsletterCanonicalTemplate.trim() === '' ? null : d.newsletterCanonicalTemplate.trim(),
  }
}

export function BusinessProfileSection({ profile }: { profile: BusinessProfile }) {
  const router = useRouter()
  const [draft, setDraft]   = useState<Draft>(() => toDraft(profile))
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)
  const [isPending, start]  = useTransition()

  // Vista previa en vivo: el valor de estos números no se entiende leyéndolos,
  // se entiende viendo qué decidirían. Se recalcula mientras escribes.
  const preview = toProfile(draft)
  const faltan  = missingFields(preview)
  const esPct   = draft.commissionModel === 'percentage'
  const simbolo = draft.currency ? CURRENCY_SYMBOL[draft.currency] : ''
  const unidad  = esPct ? ' (%)' : simbolo ? ` (${simbolo})` : ''

  const EJEMPLOS = [150_000, 300_000, 500_000, 800_000]
  // Lo que usaría "Automática", recalculado mientras se escriben las zonas.
  const sugerida = inferTimeZoneFromAreas(preview.primaryAreas)
  const comisionEjemplo = expectedCommission(400_000, preview, 'buy')

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft(d => ({ ...d, [k]: v })); setSaved(false); setError(null)
  }

  function guardar() {
    setError(null)
    start(async () => {
      const res = await saveBusinessProfile(toProfile(draft))
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div>
      <SettingsSectionHead
        title="Tu negocio"
        description="Lo que el CRM necesita saber de tu mercado para clasificar y ordenar leads."
      />
      <div className="settings-stack">
        <SettingsCard
          title="Rangos de presupuesto"
          action={(
            <InfoHint label="Qué son los rangos de presupuesto">
              Qué significa &quot;presupuesto alto&quot; en tu mercado. El CRM clasifica a cada lead
              comparándolo con estos cortes, no con una escala global: 300.000 puede ser
              un presupuesto de entrada en una ciudad y premium en otra.
            </InfoHint>
          )}
        >
          <SettingsRow label="Moneda" htmlFor="bp-currency">
            <select
              id="bp-currency"
              className="settings-input"
              value={draft.currency}
              onChange={e => set('currency', e.target.value as Currency | '')}
            >
              <option value="">Sin definir</option>
              <option value="USD">USD · $</option>
              <option value="EUR">EUR · €</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Hasta aquí es de entrada" htmlFor="bp-entry-max">
            <input
              id="bp-entry-max"
              className="settings-input"
              inputMode="numeric"
              value={draft.budgetEntryMax}
              onChange={e => set('budgetEntryMax', e.target.value)}
              placeholder="250000"
            />
          </SettingsRow>
          <SettingsRow label="Desde aquí es premium" htmlFor="bp-premium-min">
            <input
              id="bp-premium-min"
              className="settings-input"
              inputMode="numeric"
              value={draft.budgetPremiumMin}
              onChange={e => set('budgetPremiumMin', e.target.value)}
              placeholder="600000"
            />
          </SettingsRow>

          {/* Lo que estos dos números deciden, con ejemplos concretos. */}
          <div className="settings-tiers">
            {EJEMPLOS.map(monto => {
              const tier = budgetTierFor(monto, preview)
              const color = tier === 'premium' ? 'var(--status-hot)'
                : tier === 'mid' ? 'var(--accent-gold)'
                : tier === 'entry' ? 'var(--text-secondary)' : 'var(--text-muted)'
              return (
                <span
                  key={monto}
                  className="settings-tier"
                  style={{ '--tier': color } as React.CSSProperties}
                >
                  {simbolo}{monto.toLocaleString('es-ES')} → {tier ?? 'sin clasificar'}
                </span>
              )
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Zonas que atiendes"
          action={(
            <InfoHint label="Para qué sirven las zonas">
              Separadas por comas. El CRM las usa para saber si un lead cae en tu zona:
              fuera de ambas listas le resta puntos. Sin zonas declaradas no clasifica
              ninguna — prefiere no saber a castigar a un lead por un hueco de configuración.
            </InfoHint>
          )}
        >
          <SettingsRow label="Zona principal" htmlFor="bp-primary-areas">
            <div className="settings-field">
              <input
                id="bp-primary-areas"
                className="settings-input"
                value={draft.primaryAreas}
                onChange={e => set('primaryAreas', e.target.value)}
                placeholder="Virginia Beach, Norfolk"
              />
              <InfoHint label="Zona principal">Donde trabajas habitualmente.</InfoHint>
            </div>
          </SettingsRow>
          <SettingsRow label="Zona secundaria" htmlFor="bp-secondary-areas">
            <div className="settings-field">
              <input
                id="bp-secondary-areas"
                className="settings-input"
                value={draft.secondaryAreas}
                onChange={e => set('secondaryAreas', e.target.value)}
                placeholder="Chesapeake, Suffolk"
              />
              <InfoHint label="Zona secundaria">Las atiendes, pero no son tu foco.</InfoHint>
            </div>
          </SettingsRow>
          <SettingsRow label="Zona horaria de tu zona principal" htmlFor="bp-timezone">
            <div className="settings-field">
              <TimeZoneSelect
                id="bp-timezone"
                className="settings-input"
                value={draft.timezone}
                onChange={tz => set('timezone', tz)}
                emptyLabel={sugerida
                  ? `Automática — ${timeZoneLabel(sugerida)}`
                  : 'Automática — no se pudo deducir de tu zona principal'}
              />
              <InfoHint label="Cómo se elige la zona horaria">
                La hora de tus open houses y de sus correos se escribe en esta zona. En &quot;Automática&quot; se
                deduce de tu zona principal; elige una si la deducción no es la correcta.
              </InfoHint>
            </div>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard
          title="Comisión de la agencia"
          action={(
            <InfoHint label="Qué es la comisión de la agencia">
              Lo que la agencia factura por operación cerrada. Sirve para ordenar por valor
              esperado: dos leads igual de buenos no valen lo mismo si uno compra el doble.
              <br />
              Es lo que factura el negocio, no lo que se lleva cada agente: el split interno
              no se registra aquí y la ficha del lead lo dice tal cual.
            </InfoHint>
          )}
        >
          <SettingsRow label="Modelo" htmlFor="bp-commission-model">
            <select
              id="bp-commission-model"
              className="settings-input"
              value={draft.commissionModel}
              onChange={e => set('commissionModel', e.target.value as CommissionModel | '')}
            >
              <option value="">Sin definir</option>
              <option value="percentage">Porcentaje de la operación</option>
              <option value="flat">Monto fijo por operación</option>
            </select>
          </SettingsRow>
          <SettingsRow label={`Compra${unidad}`} htmlFor="bp-commission-buy">
            <input
              id="bp-commission-buy"
              className="settings-input"
              inputMode="decimal"
              value={draft.commissionBuy}
              onChange={e => set('commissionBuy', e.target.value)}
              placeholder={esPct ? '3' : '5000'}
            />
          </SettingsRow>
          <SettingsRow label={`Venta${unidad}`} htmlFor="bp-commission-sell">
            <div className="settings-field">
              <input
                id="bp-commission-sell"
                className="settings-input"
                inputMode="decimal"
                value={draft.commissionSell}
                onChange={e => set('commissionSell', e.target.value)}
                placeholder={esPct ? '3' : '5000'}
              />
              <InfoHint label="Si sólo trabajas un lado">
                Si sólo trabajas un lado del mercado, deja el otro vacío.
              </InfoHint>
            </div>
          </SettingsRow>
          {comisionEjemplo !== null && (
            <p className="settings-note">
              Con esta configuración, una compra de {formatMoney(400_000, preview.currency)} deja{' '}
              <strong className="settings-money">{formatMoney(comisionEjemplo, preview.currency)}</strong>.
            </p>
          )}
        </SettingsCard>

        <SettingsCard
          title="Tu sitio web"
          action={(
            <InfoHint label="Para qué sirve tu sitio web">
              Para que los buscadores identifiquen tu agencia y, si publicas tu newsletter
              en tu propio dominio, sepan que esa versión es el original.
            </InfoHint>
          )}
        >
          <SettingsRow label="Sitio web de la agencia" htmlFor="bp-site-url">
            <div className="settings-field">
              <input
                id="bp-site-url"
                className="settings-input"
                value={draft.publicSiteUrl}
                onChange={e => set('publicSiteUrl', e.target.value)}
                placeholder="https://tuagencia.com"
              />
              <InfoHint label="Sitio web de la agencia">
                La dirección de tu web. Se usa para identificar a tu agencia ante los buscadores.
              </InfoHint>
            </div>
          </SettingsRow>
          <SettingsRow label="Dirección de tus ediciones en tu web" htmlFor="bp-canonical">
            <div className="settings-field">
              <input
                id="bp-canonical"
                className="settings-input"
                value={draft.newsletterCanonicalTemplate}
                onChange={e => set('newsletterCanonicalTemplate', e.target.value)}
                placeholder="https://tusitio.com/newsletter/{slug}"
              />
              <InfoHint label="Dirección de tus ediciones">{CANONICAL_HELP}</InfoHint>
            </div>
          </SettingsRow>
        </SettingsCard>

        {faltan.length > 0 && (
          <p className="settings-note settings-note-gold settings-missing" role="status">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              Falta {faltan.join(', ')}. El CRM funciona igual sin esto — sólo deja de poder
              clasificar presupuestos y de ordenar por valor esperado.
            </span>
          </p>
        )}

        {error && (
          <p className="settings-alert" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {error}
          </p>
        )}

        <div className="settings-savebar settings-savebar-bare">
          {saved && (
            <span className="settings-success settings-savebar-status" role="status">
              <Check size={13} aria-hidden="true" /> Guardado
            </span>
          )}
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={isPending}>
            {isPending ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>
      </div>
    </div>
  )
}
