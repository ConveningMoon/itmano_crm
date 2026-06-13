import Link from 'next/link'
import { listSequences } from '@/lib/data/email-sequences'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { SequenceListActions } from './sequence-list-actions'
import { Plus, Mail } from 'lucide-react'

const LANG_LABEL: Record<string, string> = { es: 'Español', en: 'English', pt: 'Português' }
const LANG_COLOR: Record<string, string> = {
  es: 'var(--accent-gold)',
  en: 'var(--accent-blue)',
  pt: 'var(--accent-teal)',
}

export default async function EmailsPage() {
  const ctx = await getCurrentTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)
  const sequences = await listSequences(tenant_id, scope.agentId)

  return (
    <>
      <style>{`
        .seq-row { transition: background 0.1s; }
        .seq-row:hover { background: var(--bg-elevated) !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>
            Secuencias de Email
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {sequences.length} {sequences.length === 1 ? 'secuencia' : 'secuencias'}
          </p>
        </div>
        <Link
          href="/emails/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', fontSize: '13px', fontWeight: 500,
            background: 'var(--accent-gold)', color: 'var(--bg-base)',
            borderRadius: '8px', textDecoration: 'none', border: 'none',
          }}
        >
          <Plus size={14} />
          Nueva Secuencia
        </Link>
      </div>

      {sequences.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '64px 48px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(201,169,110,0.1)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mail size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Sin secuencias configuradas
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: '360px', margin: '0 auto 20px' }}>
            Crea tu primera secuencia para empezar a nutrir leads automáticamente con emails enviados por Resend.
          </div>
          <Link
            href="/emails/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '9px 18px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', textDecoration: 'none',
            }}
          >
            <Plus size={13} />
            Crear primera secuencia
          </Link>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isSuperAdmin
              ? '2fr 100px 60px 80px 80px 90px 120px'
              : '2fr 100px 60px 80px 80px 90px 120px',
            padding: '10px 20px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            {[
              'Nombre',
              'Idioma',
              'Pasos',
              'Canales',
              'Runs activos',
              'Estado',
              'Acciones',
              ...(isSuperAdmin ? [] : []),
            ].map(h => (
              <span key={h} style={{ fontSize: '10px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {h}
              </span>
            ))}
          </div>

          {sequences.map((seq, i) => (
            <div
              key={seq.id}
              className="seq-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 100px 60px 80px 80px 90px 120px',
                padding: '14px 20px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined,
                alignItems: 'center',
                background: 'var(--bg-surface)',
              }}
            >
              {/* Name + tenant + channel list */}
              <div>
                <Link
                  href={`/emails/${seq.id}`}
                  style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none' }}
                >
                  {seq.name}
                </Link>
                <div style={{ marginTop: '2px' }}>
                  <span style={{
                    fontSize: '10px', padding: '1px 7px', borderRadius: '4px',
                    background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                  }}>
                    {seq.agentName ?? 'Toda la agencia'}
                  </span>
                </div>
                {isSuperAdmin && seq.tenantName && (
                  <div style={{ marginTop: '2px' }}>
                    <span style={{
                      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                      background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
                    }}>
                      {seq.tenantName}
                    </span>
                  </div>
                )}
                {seq.channels.length > 0 && (
                  <div style={{ marginTop: '3px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {seq.channels.map(ch => ch.name).join(', ')}
                  </div>
                )}
              </div>

              {/* Language */}
              <span style={{
                fontSize: '11px', fontWeight: 500,
                color: LANG_COLOR[seq.language] ?? 'var(--text-muted)',
                background: `${LANG_COLOR[seq.language] ?? 'var(--text-muted)'}18`,
                padding: '2px 8px', borderRadius: '10px',
                letterSpacing: '0.04em', width: 'fit-content',
              }}>
                {LANG_LABEL[seq.language] ?? seq.language}
              </span>

              {/* Steps */}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {seq.stepCount}
              </span>

              {/* Channels count */}
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {seq.channels.length}
              </span>

              {/* Active runs */}
              <span style={{
                fontSize: '13px', fontWeight: 500,
                color: seq.activeRunCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)',
              }}>
                {seq.activeRunCount}
              </span>

              {/* Status */}
              <span style={{
                fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
                letterSpacing: '0.06em', textTransform: 'uppercase', width: 'fit-content',
                color: seq.active ? 'var(--accent-green)' : 'var(--text-muted)',
                background: seq.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
              }}>
                {seq.active ? 'Activa' : 'Inactiva'}
              </span>

              {/* Actions */}
              <SequenceListActions
                sequenceId={seq.id}
                sequenceName={seq.name}
                active={seq.active}
                activeRunCount={seq.activeRunCount}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
