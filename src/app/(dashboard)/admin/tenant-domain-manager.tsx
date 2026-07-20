'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, RefreshCw, Trash2, Check, Copy, ChevronDown } from 'lucide-react'
import { addTenantDomain, refreshTenantDomain, removeTenantDomain } from './actions'

interface DomainRecord { record?: string; type?: string; name?: string; value?: string; ttl?: string; priority?: number | null; status?: string }

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  not_configured:    { label: 'Sin dominio',   color: 'var(--text-muted)',    bg: 'var(--bg-elevated)' },
  pending:           { label: 'Pendiente',     color: 'var(--accent-gold)',   bg: 'rgba(201,169,110,0.14)' },
  verified:          { label: 'Verificado',    color: 'var(--accent-green)',  bg: 'rgba(107,163,104,0.14)' },
  failed:            { label: 'Falló',         color: 'var(--accent-coral)',  bg: 'rgba(201,123,107,0.14)' },
  temporary_failure: { label: 'Reintentando',  color: 'var(--accent-gold)',   bg: 'rgba(201,169,110,0.14)' },
}

function CopyValue({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      title="Copiar"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--accent-green)' : 'var(--text-muted)', display: 'inline-flex', padding: '2px', flexShrink: 0 }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

export function TenantDomainManager({
  tenantId, resendAccount, sendingDomain, domainStatus, domainRecords,
}: {
  tenantId: string
  resendAccount: string
  sendingDomain: string | null
  domainStatus: string
  domainRecords: DomainRecord[] | null
}) {
  const router = useRouter()
  const [open, setOpen]     = useState(false)
  const [domain, setDomain] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()

  const st = STATUS[domainStatus] ?? STATUS.not_configured
  const hasDomain = !!sendingDomain

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Error'); return }
      router.refresh()
    })
  }

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px',
          background: 'var(--bg-elevated)', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Globe size={14} color="var(--accent-gold)" />
        <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)' }}>Dominio de envío</span>
        <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '8px', color: st.color, background: st.bg }}>{st.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-muted)' }}>Cuenta: {resendAccount === 'aj' ? 'A&J (legacy)' : 'ITMANO'}</span>
        <ChevronDown size={14} color="var(--text-muted)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-surface)' }}>
          {!hasDomain ? (
            <>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Agrega el dominio de envío (ej. <code style={{ color: 'var(--text-secondary)' }}>mail.tudominio.com</code>). Se crea en la
                cuenta Resend del tenant y verás los registros DNS a configurar. Mientras no esté verificado, los correos salen del dominio de ITMANO.
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="mail.tudominio.com"
                  style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '7px 10px', fontSize: '12.5px', color: 'var(--text-primary)', outline: 'none' }}
                />
                <button
                  onClick={() => run(() => addTenantDomain({ tenantId, domain }))}
                  disabled={pending || !domain.trim()}
                  style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: (pending || !domain.trim()) ? 'default' : 'pointer', opacity: (pending || !domain.trim()) ? 0.6 : 1 }}
                >
                  {pending ? '…' : 'Agregar'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <code style={{ fontSize: '12.5px', color: 'var(--accent-gold)', fontFamily: 'monospace' }}>{sendingDomain}</code>
                <div style={{ flex: 1 }} />
                <button onClick={() => run(() => refreshTenantDomain(tenantId))} disabled={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '11.5px', borderRadius: '7px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: pending ? 'default' : 'pointer' }}>
                  <RefreshCw size={12} /> Verificar
                </button>
                <button onClick={() => run(() => removeTenantDomain(tenantId))} disabled={pending}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', fontSize: '11.5px', borderRadius: '7px', background: 'transparent', border: '1px solid rgba(201,123,107,0.3)', color: 'var(--accent-coral)', cursor: pending ? 'default' : 'pointer' }}>
                  <Trash2 size={12} /> Quitar
                </button>
              </div>

              {/* Registros DNS */}
              {domainRecords && domainRecords.length > 0 && (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '480px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-elevated)' }}>
                        {['Tipo', 'Nombre', 'Valor', 'Estado'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '9.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {domainRecords.map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.type || r.record}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{r.name}{r.name && <CopyValue text={r.name} />}</span>
                          </td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>{r.value}{r.value && <CopyValue text={r.value} />}</span>
                          </td>
                          <td style={{ padding: '6px 8px', color: r.status === 'verified' ? 'var(--accent-green)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Agrega estos registros en el DNS del dominio y pulsa <strong>Verificar</strong>. Cuando quede
                <strong> Verificado</strong>, los correos de este tenant saldrán desde su dominio.
              </div>
            </>
          )}

          {error && <div style={{ fontSize: '11.5px', color: 'var(--accent-coral)' }}>{error}</div>}
        </div>
      )}
    </div>
  )
}
