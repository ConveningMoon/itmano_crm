'use client'

import { useState } from 'react'

interface Props {
  activeContent: React.ReactNode
  historyContent: React.ReactNode
}

export function LMTabs({ activeContent, historyContent }: Props) {
  const [tab, setTab] = useState<'active' | 'history'>('active')

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: '4px',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '20px',
      }}>
        {(['active', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: tab === t ? 500 : 400,
              color: tab === t ? 'var(--accent-gold)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent-gold)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.2s',
            }}
          >
            {t === 'active' ? 'Mes Actual · Abr 2026' : 'Historial'}
          </button>
        ))}
      </div>
      {tab === 'active' ? activeContent : historyContent}
    </div>
  )
}
