'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Download, Copy, Check, Loader2, ImageIcon, AlertCircle } from 'lucide-react'
import type { CarouselBrandProfile, CarouselJob, CarouselJobWithSlides, CarouselSlide } from '@/lib/carousels/types'
import { startCarousel, renderSlide, loadCarouselJob } from './actions'

type Phase = 'idle' | 'working' | 'done' | 'error'

const SLIDE_TYPE_LABEL: Record<string, string> = {
  cover: 'Portada', data: 'Dato', emotional: 'Emocional', text: 'Impacto', cta: 'Cierre',
}

export function CarouselsClient({ brands, recentJobs }: { brands: CarouselBrandProfile[]; recentJobs: CarouselJob[] }) {
  const [agentId, setAgentId] = useState(brands[0]?.agent_id ?? '')
  const [topic, setTopic] = useState('')
  const [job, setJob] = useState<CarouselJobWithSlides | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [regenId, setRegenId] = useState<string | null>(null)

  const busy = phase === 'working'

  function patchSlide(s: CarouselSlide) {
    setJob((j) => (j ? { ...j, slides: j.slides.map((x) => (x.id === s.id ? s : x)) } : j))
  }

  async function generate() {
    if (!agentId || busy) return
    setError(null); setJob(null); setPhase('working')
    setStatus('Investigando tendencias y escribiendo el copy…')
    const res = await startCarousel({ agentId, topic: topic.trim() || undefined })
    if (!res.ok) { setPhase('error'); setError(res.error); setStatus(''); return }
    let current = res.data
    setJob(current)
    for (const s of current.slides) {
      setStatus(`Componiendo slide ${s.slide_number} de ${current.slides.length}…`)
      const r = await renderSlide(s.id)
      const next: CarouselSlide = r.ok ? r.data : { ...s, status: 'failed', error_message: r.error }
      current = { ...current, slides: current.slides.map((x) => (x.id === s.id ? next : x)) }
      setJob(current)
    }
    setPhase('done'); setStatus('Carrusel listo')
  }

  async function regenerate(slideId: string) {
    if (regenId) return
    setRegenId(slideId)
    patchSlide({ ...(job!.slides.find((s) => s.id === slideId) as CarouselSlide), status: 'rendering', error_message: null })
    const r = await renderSlide(slideId)
    if (r.ok) patchSlide(r.data)
    else patchSlide({ ...(job!.slides.find((s) => s.id === slideId) as CarouselSlide), status: 'failed', error_message: r.error })
    setRegenId(null)
  }

  async function openJob(id: string) {
    if (busy) return
    setError(null); setStatus(''); setPhase('working')
    const r = await loadCarouselJob(id)
    if (r.ok) { setJob(r.data); setPhase('done') } else { setPhase('error'); setError(r.error) }
  }

  function copyCaption() {
    if (!job?.caption) return
    const text = `${job.caption}\n\n${(job.hashtags ?? []).join(' ')}`
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })
  }

  async function downloadAll() {
    if (!job) return
    for (const s of job.slides) {
      if (!s.rendered_url) continue
      try {
        const blob = await (await fetch(s.rendered_url)).blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `slide-${String(s.slide_number).padStart(2, '0')}.png`
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      } catch { /* omitir el que falle */ }
    }
  }

  const readyCount = job?.slides.filter((s) => s.status === 'ready').length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        .ce-btn:hover:not(:disabled){filter:brightness(1.08)}
        .ce-chip:hover:not(.ce-on){border-color:var(--accent-gold)!important}
        .ce-slide:hover .ce-regen{opacity:1}
      `}</style>

      {/* ── Panel de control ── */}
      <div style={card()}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {brands.map((b) => {
            const on = b.agent_id === agentId
            return (
              <button
                key={b.agent_id}
                className={`ce-chip${on ? ' ce-on' : ''}`}
                onClick={() => setAgentId(b.agent_id)}
                disabled={busy}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                  padding: '10px 14px', borderRadius: '10px', cursor: busy ? 'default' : 'pointer',
                  background: on ? 'rgba(190,154,84,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${on ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{b.display_name}</span>
                <span style={{ fontSize: '11px', color: 'var(--accent-gold)' }}>{b.instagram_handle}</span>
              </button>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: '10px', border: '1px dashed var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)' }}>
            Más agentes · próximamente
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            disabled={busy}
            placeholder="Tema (opcional) — vacío = la IA investiga tendencias actuales"
            style={{
              flex: 1, minWidth: '260px', padding: '11px 14px', fontSize: '13px', borderRadius: '8px',
              background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
            }}
          />
          <button
            className="ce-btn"
            onClick={generate}
            disabled={busy || !agentId}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', fontSize: '13px', fontWeight: 500,
              borderRadius: '8px', border: 'none', cursor: busy || !agentId ? 'default' : 'pointer',
              background: 'var(--accent-gold)', color: '#1B1508', opacity: busy || !agentId ? 0.6 : 1,
            }}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            Generar carrusel
          </button>
        </div>

        {(status || error) && (
          <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: error ? 'var(--status-lost, #c96b6b)' : 'var(--text-secondary)' }}>
            {error ? <AlertCircle size={14} /> : busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
            <span>{error ?? status}</span>
          </div>
        )}
        <style>{`.spin{animation:cespin 1s linear infinite}@keyframes cespin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* ── Resultado ── */}
      {job && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{job.topic || 'Carrusel'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {job.audience ? `${job.audience} · ` : ''}{readyCount}/{job.slides.length} slides listos
                {job.topic_source === 'trend_research' ? ' · tema por IA' : ' · tema manual'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="ce-btn" onClick={downloadAll} disabled={readyCount === 0} style={secondaryBtn(readyCount === 0)}>
                <Download size={14} /> Descargar PNGs
              </button>
            </div>
          </div>

          {/* Grid de slides */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
            {job.slides.map((s) => (
              <SlideCard key={s.id} slide={s} regenerating={regenId === s.id} onRegen={() => regenerate(s.id)} />
            ))}
          </div>

          {/* Caption */}
          {job.caption && (
            <div style={{ marginTop: '18px', padding: '16px', borderRadius: '10px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Caption</span>
                <button className="ce-btn" onClick={copyCaption} style={secondaryBtn(false)}>
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.55 }}>{job.caption}</p>
              <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {(job.hashtags ?? []).map((h) => (
                  <span key={h} style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(190,154,84,0.1)', padding: '2px 8px', borderRadius: '6px' }}>{h}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      {recentJobs.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Carruseles recientes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {recentJobs.map((j) => (
              <button
                key={j.id}
                onClick={() => openJob(j.id)}
                className="ce-btn"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                  padding: '10px 12px', borderRadius: '8px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.topic || 'Sin título'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <StatusBadge status={j.status} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(j.created_at).toLocaleDateString('es')}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SlideCard({ slide, regenerating, onRegen }: { slide: CarouselSlide; regenerating: boolean; onRegen: () => void }) {
  const rendering = slide.status === 'rendering' || regenerating
  return (
    <div className="ce-slide" style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-subtle)', aspectRatio: '4 / 5', background: 'var(--bg-base)' }}>
      {slide.rendered_url && !rendering ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.rendered_url} alt={`Slide ${slide.slide_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: slide.status === 'failed' ? 'var(--status-lost, #c96b6b)' : 'var(--text-muted)' }}>
          {rendering ? <Loader2 size={20} className="spin" /> : slide.status === 'failed' ? <AlertCircle size={20} /> : <ImageIcon size={20} />}
          <span style={{ fontSize: '11px', textAlign: 'center', padding: '0 10px' }}>
            {rendering ? 'Componiendo…' : slide.status === 'failed' ? (slide.error_message ?? 'Error') : 'En cola'}
          </span>
        </div>
      )}

      <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', gap: '4px' }}>
        <span style={badge()}>{slide.slide_number}</span>
        {slide.slide_type && <span style={badge()}>{SLIDE_TYPE_LABEL[slide.slide_type] ?? slide.slide_type}</span>}
      </div>

      <button
        className="ce-regen ce-btn"
        onClick={onRegen}
        disabled={rendering}
        title="Regenerar slide"
        style={{
          position: 'absolute', bottom: '6px', right: '6px', opacity: rendering ? 1 : 0, transition: 'opacity var(--dur-fast, .15s)',
          display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 9px', fontSize: '11px', borderRadius: '6px',
          border: 'none', cursor: rendering ? 'default' : 'pointer', background: 'rgba(20,20,24,0.82)', color: '#fff',
        }}
      >
        <RefreshCw size={12} className={rendering ? 'spin' : undefined} /> Regenerar
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    ready: { label: 'Listo', color: 'var(--accent-green, #6bbf8a)' },
    failed: { label: 'Error', color: 'var(--status-lost, #c96b6b)' },
    composing: { label: 'Componiendo', color: 'var(--accent-gold)' },
    generating_images: { label: 'Imágenes', color: 'var(--accent-gold)' },
    writing_copy: { label: 'Copy', color: 'var(--accent-blue, #5B8EC9)' },
    researching: { label: 'Investigando', color: 'var(--accent-blue, #5B8EC9)' },
    pending: { label: 'En cola', color: 'var(--text-muted)' },
  }
  const s = map[status] ?? map.pending
  return <span style={{ fontSize: '11px', color: s.color, background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '6px' }}>{s.label}</span>
}

function card(): React.CSSProperties {
  return { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px' }
}
function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px', borderRadius: '7px',
    border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  }
}
function badge(): React.CSSProperties {
  return { fontSize: '10px', fontWeight: 500, color: '#fff', background: 'rgba(20,20,24,0.75)', padding: '2px 7px', borderRadius: '5px' }
}
