'use client'

import { useState } from 'react'
import { Save, Check, Loader2, AlertCircle, Info, RotateCcw } from 'lucide-react'
import type { CarouselBrandProfile } from '@/lib/carousels/types'
import { updateBrandProfile } from './actions'

// Contexto de marca por agente: qué sabe la IA del tenant, el objetivo y la voz.
// Editable y persistido en carousel_brand_profiles. Este contexto se lee UNA vez
// por carrusel (en el paso de copy), no por slide — y va cacheado (prompt
// caching): editar aquí solo re-lee la parte cambiada la próxima vez.

const FIELD_LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '6px', fontWeight: 500,
}
function input(): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '8px',
    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
  }
}

export function ContextPanel({ brands, defaultStylePrompt }: { brands: CarouselBrandProfile[]; defaultStylePrompt: string }) {
  const [agentId, setAgentId] = useState(brands[0]?.agent_id ?? '')
  const active = brands.find((b) => b.agent_id === agentId) ?? brands[0]

  if (!active) {
    return (
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        No hay perfiles de marca configurados todavía.
      </div>
    )
  }

  return <BrandForm key={active.agent_id} brand={active} brands={brands} onPick={setAgentId} agentId={agentId} defaultStylePrompt={defaultStylePrompt} />
}

function BrandForm({ brand, brands, onPick, agentId, defaultStylePrompt }: {
  brand: CarouselBrandProfile
  brands: CarouselBrandProfile[]
  onPick: (id: string) => void
  agentId: string
  defaultStylePrompt: string
}) {
  const [displayName, setDisplayName] = useState(brand.display_name)
  const [handle, setHandle] = useState(brand.instagram_handle)
  const [agency, setAgency] = useState(brand.agency_name ?? '')
  const [market, setMarket] = useState(brand.market ?? '')
  const [voice, setVoice] = useState(brand.brand_voice ?? '')
  // Prompt de estilo/diseño: si el agente no lo sobreescribió, arranca del default.
  const usingDefaultStyle = !brand.style_prompt
  const [style, setStyle] = useState(brand.style_prompt ?? defaultStylePrompt)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    const res = await updateBrandProfile({
      agentId: brand.agent_id,
      display_name: displayName,
      instagram_handle: handle,
      agency_name: agency || null,
      market: market || null,
      language: brand.language,
      brand_voice: voice || null,
      // Si coincide con el default, guardamos null (seguir el default del código).
      style_prompt: style.trim() === defaultStylePrompt.trim() ? null : (style || null),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    else setError(res.error)
  }

  function resetStyle() { setStyle(defaultStylePrompt) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <style>{`.ce-btn:hover:not(:disabled){filter:brightness(1.08)} .spin{animation:cespin 1s linear infinite}@keyframes cespin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', borderRadius: '10px', background: 'rgba(91,142,201,0.08)', border: '1px solid rgba(91,142,201,0.2)' }}>
        <Info size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: '1px' }} />
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Este es el contexto que la IA usa para escribir carruseles personalizados al nicho de este agente.
          Se lee <strong>una sola vez por carrusel</strong> (al redactar el copy), no por slide, y va con
          prompt caching: editarlo solo re-procesa la parte que cambiaste la próxima vez, así que su
          impacto en el costo es mínimo.
        </p>
      </div>

      {brands.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {brands.map((b) => {
            const on = b.agent_id === agentId
            return (
              <button
                key={b.agent_id}
                onClick={() => onPick(b.agent_id)}
                style={{
                  padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                  background: on ? 'rgba(190,154,84,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${on ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                  color: on ? 'var(--accent-gold)' : 'var(--text-secondary)',
                }}
              >
                {b.display_name}
              </button>
            )
          })}
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          <div>
            <label style={FIELD_LABEL}>Nombre del agente</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={input()} />
          </div>
          <div>
            <label style={FIELD_LABEL}>Instagram (@usuario)</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} style={input()} />
          </div>
          <div>
            <label style={FIELD_LABEL}>Agencia</label>
            <input value={agency} onChange={(e) => setAgency(e.target.value)} style={input()} placeholder="Solo aparece en portada y cierre" />
          </div>
          <div>
            <label style={FIELD_LABEL}>Mercado</label>
            <input value={market} onChange={(e) => setMarket(e.target.value)} style={input()} placeholder="p. ej. Virginia & North Carolina" />
          </div>
        </div>

        <div>
          <label style={FIELD_LABEL}>Objetivo y voz de marca — qué sabe la IA de este nicho</label>
          <textarea
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            rows={6}
            style={{ ...input(), resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
            placeholder="Audiencia, tono, family-first, bilingüe, sin venta agresiva, objetivo de los carruseles…"
          />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
            Esto define a quién van dirigidos los carruseles y con qué tono. Sé específico del nicho del tenant.
          </p>
        </div>

        {/* Prompt de estilo / diseño (reglas v2) — editable */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
            <label style={{ ...FIELD_LABEL, marginBottom: 0 }}>Prompt de estilo y diseño (sistema v2) — cómo se genera</label>
            <button
              onClick={resetStyle}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 9px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <RotateCcw size={12} /> Restaurar default
            </button>
          </div>
          <textarea
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            rows={14}
            style={{ ...input(), resize: 'vertical', lineHeight: 1.55, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}
          />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Estas son las reglas que la IA sigue para el estilo, la estructura y la redacción de cada carrusel.
            {usingDefaultStyle && <span style={{ color: 'var(--accent-gold)' }}> Actualmente se usa el default del sistema.</span>}{' '}
            Las <strong>reglas duras</strong> (no inventar datos ni cifras sin fuente, no rostros reales identificables, footer y hashtags)
            se aplican <strong>siempre</strong>, edites o no este prompt. Si lo dejas igual al default, se sigue usando el default.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="ce-btn"
            onClick={save}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: 500,
              borderRadius: '8px', border: 'none', cursor: saving ? 'default' : 'pointer',
              background: 'var(--accent-gold)', color: '#1B1508', opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={15} className="spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? 'Guardado' : 'Guardar contexto'}
          </button>
          {error && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--status-lost, #c96b6b)' }}>
              <AlertCircle size={14} /> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
