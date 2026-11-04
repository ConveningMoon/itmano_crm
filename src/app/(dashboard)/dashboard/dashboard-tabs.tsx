'use client'

import { useOptimistic, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { RefreshingPill } from '@/components/ui/loading-indicator'
import { PERIODS, DEFAULT_PERIOD, type PeriodDays } from '@/lib/dashboard/period'
import type { DashboardTab } from '@/lib/dashboard/params'

interface Props {
  tabs: { key: DashboardTab; label: string }[]
  active: DashboardTab
  period: PeriodDays
  showPeriod: boolean
  children: ReactNode
}

type View = { tab: DashboardTab; period: PeriodDays }

export function DashboardTabs({ tabs, active, period, showPeriod, children }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  // La pestaña y el periodo elegidos se marcan al instante; la URL (y el
  // contenido) los confirma cuando llega la nueva vista.
  const [view, setView] = useOptimistic<View, View>({ tab: active, period }, (_, next) => next)

  function go(next: View) {
    const params = new URLSearchParams()
    if (next.tab !== 'general') params.set('tab', next.tab)
    if (next.period !== DEFAULT_PERIOD) params.set('periodo', String(next.period))
    const qs = params.toString()
    startTransition(() => {
      setView(next)
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <RefreshingPill show={pending} />
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap', marginBottom: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div role="tablist" aria-label="Secciones del dashboard" style={{ display: 'flex', gap: '4px', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', paddingBottom: '1px', marginBottom: '-1px', maxWidth: '100%' }}>
          {tabs.map(t => {
            const selected = view.tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => { if (!selected) go({ tab: t.key, period: view.period }) }}
                style={{
                  padding: '10px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                  background: 'transparent', border: 'none', whiteSpace: 'nowrap',
                  color: selected ? 'var(--accent-gold)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${selected ? 'var(--accent-gold)' : 'transparent'}`,
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {showPeriod && (
          <div role="group" aria-label="Periodo" style={{ display: 'flex', gap: '4px', paddingBottom: '6px' }}>
            {PERIODS.map(p => {
              const selected = view.period === p.days
              return (
                <button
                  key={p.days}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { if (!selected) go({ tab: view.tab, period: p.days }) }}
                  style={{
                    padding: '4px 10px', fontSize: '12px', cursor: 'pointer', borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: selected ? 'color-mix(in srgb, var(--accent-gold) 14%, transparent)' : 'transparent',
                    color: selected ? 'var(--accent-gold)' : 'var(--text-muted)',
                  }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div role="tabpanel">{children}</div>
    </div>
  )
}
