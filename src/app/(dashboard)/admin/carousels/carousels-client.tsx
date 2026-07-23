'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, Download, Copy, Check, Loader2, ImageIcon, AlertCircle, Trash2, Search, PenLine, PlayCircle, ScrollText } from 'lucide-react'
import type { CarouselBrandProfile, CarouselJob, CarouselJobWithSlides, CarouselSlide } from '@/lib/carousels/types'
import type { CarouselLogRow } from '@/lib/data/carousels'
import { PILLAR_LABELS } from '@/lib/carousels/brand'
import { startCarousel, renderSlide, loadCarouselJob, deleteCarousel, loadCarouselLogs } from './actions'

type Phase = 'idle' | 'researching' | 'rendering' | 'done' | 'error'

const SLIDE_TYPE_LABEL: Record<string, string> = {
  cover: 'Portada', data: 'Dato', emotional: 'Emocional', text: 'Impacto', cta: 'Cierre',
}

export function CarouselsClient({ brands, recentJobs, initialJob }: { brands: CarouselBrandProfile[]; recentJobs: CarouselJob[]; initialJob: CarouselJobWithSlides | null }) {
  const [agentId, setAgentId] = useState(brands[0]?.agent_id ?? '')
  const [topic, setTopic] = useState('')
  const [job, setJob] = useState<CarouselJobWithSlides | null>(initialJob)
  const [jobs, setJobs] = useState<CarouselJob[]>(recentJobs)
  const [phase, setPhase] = useState<Phase>(initialJob ? 'done' : 'idle')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [regenId, setRegenId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const [logs, setLogs] = useState<CarouselLogRow[] | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  const busy = phase === 'researching' || phase === 'rendering'

  function patchSlide(s: CarouselSlide) {
    setJob((j) => (j ? { ...j, slides: j.slides.map((x) => (x.id === s.id ? s : x)) } : j))
  }

  async function safeRender(id: string): Promise<CarouselSlide | { error: string }> {
    try {
      const r = await renderSlide(id)
      return r.ok ? r.data : { error: r.error }
    } catch (e) {
      // Nunca dejar que un throw rompa el bucle: los demás slides deben seguir.
      return { error: e instanceof Error ? e.message : 'Error inesperado al renderizar' }
    }
  }

  async function generate() {
    if (!agentId || busy) return
    setError(null); setJob(null); setPhase('researching')
    setStatus(topic.trim() ? 'Redactando el copy con IA…' : 'Investigando tendencias y redactando el copy con IA…')

    let res
    try {
      res = await startCarousel({ agentId, topic: topic.trim() || undefined })
    } catch (e) {
      setPhase('error'); setError(e instanceof Error ? e.message : 'Error al iniciar la generación'); setStatus(''); return
    }
    if (!res.ok) { setPhase('error'); setError(res.error); setStatus(''); return }

    let current = res.data
    setJob(current)
    setPhase('rendering')

    for (let i = 0; i < current.slides.length; i++) {
      const s = current.slides[i]
      setStatus(`Componiendo slide ${s.slide_number} (${i + 1} de ${current.slides.length})…`)
      // Marcar "componiendo" en vivo.
      current = { ...current, slides: current.slides.map((x) => (x.id === s.id ? { ...x, status: 'rendering' } : x)) }
      setJob(current)
      const out = await safeRender(s.id)
      const next: CarouselSlide = 'error' in out ? { ...s, status: 'failed', error_message: out.error } : out
      current = { ...current, slides: current.slides.map((x) => (x.id === s.id ? next : x)) }
      setJob(current)
    }

    const failed = current.slides.filter((s) => s.status === 'failed').length
    setPhase('done')
    setStatus(failed > 0
      ? `Terminado con ${failed} slide(s) con error — revisa el detalle y usa "Regenerar"`
      : 'Carrusel listo')
  }

  async function regenerate(slideId: string) {
    if (regenId) return
    setRegenId(slideId)
    const orig = job!.slides.find((s) => s.id === slideId) as CarouselSlide
    patchSlide({ ...orig, status: 'rendering', error_message: null })
    const out = await safeRender(slideId)
    patchSlide('error' in out ? { ...orig, status: 'failed', error_message: out.error } : out)
    setRegenId(null)
  }

  async function openJob(id: string) {
    if (busy || openingId) return
    setError(null); setStatus(''); setOpeningId(id); setLogs(null); setLogsOpen(false)
    const r = await loadCarouselJob(id)
    setOpeningId(null)
    if (r.ok) { setJob(r.data); setPhase('done') } else { setPhase('error'); setError(r.error) }
  }

  // Reanudar: renderiza los slides pendientes o en error (p. ej. tras recargar).
  async function resumePending() {
    if (!job || resuming || busy) return
    const todo = job.slides.filter((s) => s.status === 'pending' || s.status === 'failed')
    if (todo.length === 0) return
    setResuming(true); setPhase('rendering')
    let current = job
    for (let i = 0; i < todo.length; i++) {
      const s = todo[i]
      setStatus(`Renderizando pendiente ${i + 1} de ${todo.length} (slide ${s.slide_number})…`)
      current = { ...current, slides: current.slides.map((x) => (x.id === s.id ? { ...x, status: 'rendering' } : x)) }
      setJob(current)
      const out = await safeRender(s.id)
      const next: CarouselSlide = 'error' in out ? { ...s, status: 'failed', error_message: out.error } : out
      current = { ...current, slides: current.slides.map((x) => (x.id === s.id ? next : x)) }
      setJob(current)
    }
    const failed = current.slides.filter((s) => s.status === 'failed').length
    setResuming(false); setPhase('done')
    setStatus(failed > 0 ? `Terminado con ${failed} slide(s) con error` : 'Pendientes completados')
  }

  async function toggleLogs() {
    if (!job) return
    if (logsOpen) { setLogsOpen(false); return }
    setLogsOpen(true)
    if (!logs) {
      setLogsLoading(true)
      const r = await loadCarouselLogs(job.id)
      setLogsLoading(false)
      setLogs(r.ok ? r.data : [])
    }
  }

  function downloadLogs() {
    if (!job || !logs) return
    const text = logs.map((l) => {
      const cost = l.cost_usd != null ? ` [${l.provider ?? ''} ${l.model ?? ''} $${Number(l.cost_usd).toFixed(4)} ${l.billing ?? ''}]` : ''
      const detail = l.detail ? `\n    ${JSON.stringify(l.detail)}` : ''
      return `${l.created_at} · ${l.level.toUpperCase()} · ${l.step}${l.slide_number != null ? ` · slide ${l.slide_number}` : ''} · ${l.message}${cost}${detail}`
    }).join('\n')
    const blob = new Blob([`Carrusel ${job.id} — ${job.topic ?? ''}\n\n${text}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `carousel-${job.id.slice(0, 8)}-logs.txt`
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }

  async function removeJob(id: string) {
    if (deletingId) return
    if (!window.confirm('¿Eliminar este carrusel? Se borran sus slides, imágenes y su historial de costos. No se puede deshacer.')) return
    setDeletingId(id)
    const r = await deleteCarousel(id)
    setDeletingId(null)
    if (r.ok) {
      setJobs((xs) => xs.filter((j) => j.id !== id))
      if (job?.id === id) { setJob(null); setPhase('idle'); setStatus('') }
    } else {
      window.alert(`No se pudo eliminar: ${r.error}`)
    }
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

  const slides = job?.slides ?? []
  const readyCount = slides.filter((s) => s.status === 'ready').length
  const failedCount = slides.filter((s) => s.status === 'failed').length
  const renderingCount = slides.filter((s) => s.status === 'rendering').length
  const queuedCount = slides.filter((s) => s.status === 'pending').length
  const total = slides.length
  const doneCount = readyCount + failedCount
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const pendingCount = queuedCount + failedCount // pendientes + con error (reintentables)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <style>{`
        .ce-btn:hover:not(:disabled){filter:brightness(1.08)}
        .ce-chip:hover:not(.ce-on){border-color:var(--accent-gold)!important}
        .ce-slide:hover .ce-regen{opacity:1}
        .ce-jobrow:hover .ce-del{opacity:1}
        .spin{animation:cespin 1s linear infinite}@keyframes cespin{to{transform:rotate(360deg)}}
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

        {/* ── Progreso ── */}
        {(phase !== 'idle') && (
          <div style={{ marginTop: '16px' }}>
            <Stepper phase={phase} doneCount={doneCount} total={total} />
            {(phase === 'rendering' && total > 0) && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>{status}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{doneCount}/{total} · {pct}%</span>
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(3, pct)}%`, borderRadius: '3px', background: 'var(--accent-gold)', transition: 'width .3s' }} />
                </div>
                <div style={{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap', fontSize: '11.5px' }}>
                  <Count color="var(--accent-green, #6bbf8a)" label="Listos" n={readyCount} />
                  <Count color="var(--accent-gold)" label="Componiendo" n={renderingCount} />
                  <Count color="var(--text-muted)" label="En cola" n={queuedCount} />
                  <Count color="var(--status-lost, #c96b6b)" label="Con error" n={failedCount} />
                </div>
              </div>
            )}
            {(phase === 'researching' || phase === 'done' || phase === 'error') && (status || error) && (
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: error ? 'var(--status-lost, #c96b6b)' : 'var(--text-secondary)' }}>
                {error ? <AlertCircle size={14} /> : phase === 'researching' ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                <span>{error ?? status}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Resultado ── */}
      {job && (
        <div style={card()}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{job.topic || 'Carrusel'}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {job.pillar ? `${PILLAR_LABELS[job.pillar] ?? job.pillar} · ` : ''}
                {job.audience ? `${job.audience} · ` : ''}{readyCount}/{job.slides.length} slides listos
                {failedCount > 0 ? ` · ${failedCount} con error` : ''}
                {job.topic_source === 'trend_research' ? ' · tema por IA' : ' · tema manual'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {pendingCount > 0 && !busy && (
                <button className="ce-btn" onClick={resumePending} disabled={resuming} style={{ ...secondaryBtn(resuming), color: 'var(--accent-gold)', borderColor: 'var(--accent-gold)' }}>
                  {resuming ? <Loader2 size={14} className="spin" /> : <PlayCircle size={14} />} Renderizar {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                </button>
              )}
              <button className="ce-btn" onClick={toggleLogs} style={secondaryBtn(false)}>
                <ScrollText size={14} /> {logsOpen ? 'Ocultar' : 'Ver'} registro
              </button>
              <button className="ce-btn" onClick={downloadAll} disabled={readyCount === 0} style={secondaryBtn(readyCount === 0)}>
                <Download size={14} /> Descargar PNGs
              </button>
              <button className="ce-btn" onClick={() => removeJob(job.id)} disabled={deletingId === job.id} style={dangerBtn(deletingId === job.id)}>
                {deletingId === job.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />} Eliminar
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

          {/* Registro del proceso (logs) */}
          {logsOpen && (
            <div style={{ marginTop: '18px', padding: '16px', borderRadius: '10px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Registro del proceso</span>
                {logs && logs.length > 0 && (
                  <button className="ce-btn" onClick={downloadLogs} style={secondaryBtn(false)}><Download size={14} /> Descargar .txt</button>
                )}
              </div>
              {logsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-muted)' }}><Loader2 size={14} className="spin" /> Cargando registro…</div>
              ) : !logs || logs.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Sin registros para este carrusel.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: '11.5px' }}>
                  {logs.map((l) => {
                    const c = l.level === 'error' ? 'var(--status-lost, #c96b6b)' : l.level === 'warn' ? 'var(--accent-gold)' : 'var(--text-secondary)'
                    return (
                      <div key={l.id} style={{ display: 'flex', gap: '8px', color: c, lineHeight: 1.4 }}>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{new Date(l.created_at).toLocaleTimeString('es')}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, textTransform: 'uppercase' }}>{l.step}{l.slide_number != null ? `·${l.slide_number}` : ''}</span>
                        <span>{l.message}{l.cost_usd != null ? ` · $${Number(l.cost_usd).toFixed(4)} (${l.billing})` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      {jobs.length > 0 && (
        <div style={card()}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Carruseles recientes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {jobs.map((j) => (
              <div key={j.id} className="ce-jobrow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => openJob(j.id)}
                  className="ce-btn"
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    padding: '10px 12px', borderRadius: '8px', border: 'none', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left', minWidth: 0,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j.topic || 'Sin título'}
                    </span>
                    {j.pillar && (
                      <span style={{ flexShrink: 0, fontSize: '10px', color: 'var(--accent-gold)', background: 'rgba(190,154,84,0.1)', padding: '1px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>
                        {PILLAR_LABELS[j.pillar] ?? j.pillar}
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    {openingId === j.id
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-gold)' }}><Loader2 size={13} className="spin" /> Cargando…</span>
                      : <StatusBadge status={j.status} />}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(j.created_at).toLocaleDateString('es')}</span>
                  </span>
                </button>
                <button
                  className="ce-del ce-btn"
                  onClick={() => removeJob(j.id)}
                  disabled={deletingId === j.id}
                  title="Eliminar carrusel"
                  style={{
                    opacity: deletingId === j.id ? 1 : 0, transition: 'opacity var(--dur-fast, .15s)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                    borderRadius: '7px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
                    color: 'var(--status-lost, #c96b6b)', cursor: deletingId === j.id ? 'default' : 'pointer', flexShrink: 0,
                  }}
                >
                  {deletingId === j.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stepper({ phase, doneCount, total }: { phase: Phase; doneCount: number; total: number }) {
  const copyDone = phase === 'rendering' || phase === 'done'
  const renderDone = phase === 'done' && (total === 0 || doneCount >= total)
  const steps = [
    { key: 'research', label: 'Investigación y copy', icon: phase === 'researching' ? 'spin' : copyDone ? 'done' : phase === 'error' && !copyDone ? 'err' : 'idle', node: <Search size={13} /> },
    { key: 'render', label: 'Composición de slides', icon: phase === 'rendering' ? 'spin' : renderDone ? 'done' : 'idle', node: <PenLine size={13} /> },
    { key: 'done', label: 'Listo', icon: renderDone ? 'done' : 'idle', node: <Check size={13} /> },
  ]
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {steps.map((s) => {
        const color = s.icon === 'done' ? 'var(--accent-green, #6bbf8a)' : s.icon === 'spin' ? 'var(--accent-gold)' : s.icon === 'err' ? 'var(--status-lost, #c96b6b)' : 'var(--text-muted)'
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '20px', border: `1px solid ${s.icon === 'idle' ? 'var(--border-subtle)' : color}`, background: s.icon === 'idle' ? 'transparent' : `color-mix(in srgb, ${color} 10%, transparent)` }}>
            <span style={{ color }}>
              {s.icon === 'spin' ? <Loader2 size={13} className="spin" /> : s.icon === 'done' ? <Check size={13} /> : s.icon === 'err' ? <AlertCircle size={13} /> : s.node}
            </span>
            <span style={{ fontSize: '11.5px', color: s.icon === 'idle' ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function Count({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-muted)' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
      {label}: <strong style={{ color: 'var(--text-secondary)' }}>{n}</strong>
    </span>
  )
}

function SlideCard({ slide, regenerating, onRegen }: { slide: CarouselSlide; regenerating: boolean; onRegen: () => void }) {
  const rendering = slide.status === 'rendering' || regenerating
  const proceduralNote = slide.status === 'ready' && slide.error_message
  return (
    <div className="ce-slide" style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${slide.status === 'failed' ? 'var(--status-lost, #c96b6b)' : 'var(--border-subtle)'}`, aspectRatio: '4 / 5', background: 'var(--bg-base)' }}>
      {slide.rendered_url && !rendering ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.rendered_url} alt={`Slide ${slide.slide_number}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: slide.status === 'failed' ? 'var(--status-lost, #c96b6b)' : 'var(--text-muted)' }}>
          {rendering ? <Loader2 size={20} className="spin" /> : slide.status === 'failed' ? <AlertCircle size={20} /> : <ImageIcon size={20} />}
          <span style={{ fontSize: '11px', textAlign: 'center', padding: '0 10px', lineHeight: 1.4 }}>
            {rendering ? 'Componiendo…' : slide.status === 'failed' ? (slide.error_message ?? 'Error') : 'En cola'}
          </span>
        </div>
      )}

      <div style={{ position: 'absolute', top: '6px', left: '6px', display: 'flex', gap: '4px' }}>
        <span style={badge()}>{slide.slide_number}</span>
        {slide.slide_type && <span style={badge()}>{SLIDE_TYPE_LABEL[slide.slide_type] ?? slide.slide_type}</span>}
        {proceduralNote && <span style={{ ...badge(), background: 'rgba(190,154,84,0.85)' }} title={slide.error_message ?? ''}>sin foto</span>}
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
function dangerBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', fontSize: '12px', borderRadius: '7px',
    border: '1px solid color-mix(in srgb, var(--status-lost, #c96b6b) 40%, transparent)', background: 'color-mix(in srgb, var(--status-lost, #c96b6b) 10%, transparent)',
    color: 'var(--status-lost, #c96b6b)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
  }
}
function badge(): React.CSSProperties {
  return { fontSize: '10px', fontWeight: 500, color: '#fff', background: 'rgba(20,20,24,0.75)', padding: '2px 7px', borderRadius: '5px' }
}
