'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/leads':        'Leads',
  '/lead-magnets': 'Lead Magnets',
  '/analytics':    'Analytics',
  '/settings':     'Configuración',
}

export function Topbar() {
  const pathname = usePathname()
  const router = useRouter()
  const title = PAGE_TITLES[pathname] ?? 'ITMANO CRM'

  return (
    <header
      style={{
        height: '56px',
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          fontSize: '15px',
          fontWeight: '500',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-gold)',
            color: '#0B0C0E',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onClick={() => router.push('/leads/new')}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-gold-dim)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-gold)' }}
        >
          <Plus size={14} strokeWidth={2} />
          Registrar Lead
        </button>

        {/* User avatar */}
        <div
          title="Adriana Melendez"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: 'rgba(91,142,201,0.15)',
            border: '1px solid rgba(91,142,201,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--accent-blue)',
            cursor: 'default',
          }}
        >
          AM
        </div>
      </div>
    </header>
  )
}
