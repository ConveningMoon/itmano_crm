import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardTab } from '@/lib/dashboard/params'

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
}

function KpiRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{ ...CARD, borderRadius: '16px', padding: '16px 18px' }}>
          <Skeleton w="60%" h={12} />
          <Skeleton w="40%" h={32} />
          <Skeleton w="50%" h={10} />
        </div>
      ))}
    </div>
  )
}

function ChartCard({ h = 200 }: { h?: number }) {
  return (
    <div style={{ ...CARD, marginBottom: '24px' }}>
      <Skeleton w="140px" h={14} r={4} />
      <Skeleton w="100%" h={h} r={8} />
    </div>
  )
}

export function GeneralSkeleton() {
  return (
    <div>
      <KpiRow />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ marginBottom: '16px' }}>
        <div style={CARD}><Skeleton w="140px" h={14} r={4} /><Skeleton w="100%" h={230} r={8} /></div>
        <div style={CARD}><Skeleton w="100px" h={14} r={4} /><Skeleton w="100%" h={230} r={8} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginBottom: '16px' }}>
        <div style={CARD}>
          <Skeleton w="80px" h={14} r={4} />
          {[...Array(5)].map((_, i) => <Skeleton key={i} w="100%" h={44} r={8} />)}
        </div>
        <div style={CARD}><Skeleton w="120px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
        <div style={CARD}><Skeleton w="80px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div style={CARD}><Skeleton w="140px" h={14} r={4} /><Skeleton w="100%" h={200} r={8} /></div>
        <div style={CARD}>
          <Skeleton w="120px" h={14} r={4} />
          {[...Array(4)].map((_, i) => <Skeleton key={i} w="100%" h={36} r={8} />)}
        </div>
      </div>
    </div>
  )
}

function AgentesSkeleton() {
  return (
    <div>
      <KpiRow />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <div style={CARD}>
          <Skeleton w="140px" h={14} r={4} />
          {[...Array(4)].map((_, i) => <Skeleton key={i} w="100%" h={44} r={8} />)}
        </div>
        <div style={CARD}><Skeleton w="120px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} style={CARD}><Skeleton w="120px" h={14} r={4} /><Skeleton w="100%" h={160} r={8} /></div>
        ))}
      </div>
    </div>
  )
}

function EmailsSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" style={{ marginBottom: '16px' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className={i === 0 ? 'col-span-2 md:col-span-1' : undefined} style={{ ...CARD, borderRadius: '16px', padding: '16px 18px' }}>
            <Skeleton w="60%" h={12} />
            <Skeleton w="40%" h={32} />
            <Skeleton w="50%" h={10} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <div style={CARD}><Skeleton w="80px" h={14} r={4} /><Skeleton w="100%" h={200} r={8} /></div>
        <div style={CARD}><Skeleton w="120px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <div style={CARD}>
          <Skeleton w="120px" h={14} r={4} />
          {[...Array(4)].map((_, i) => <Skeleton key={i} w="100%" h={36} r={8} />)}
        </div>
        <div style={CARD}><Skeleton w="140px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
      </div>
    </div>
  )
}

function FuentesSkeleton() {
  return (
    <div>
      <KpiRow />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4" style={{ marginBottom: '16px' }}>
        <div style={CARD}>
          <Skeleton w="140px" h={14} r={4} />
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_196px] gap-4">
            <Skeleton w="100%" h={260} r={8} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...Array(6)].map((_, i) => <Skeleton key={i} w="100%" h={28} r={8} />)}
            </div>
          </div>
        </div>
        <div style={CARD}><Skeleton w="120px" h={14} r={4} /><Skeleton w="100%" h={128} r={8} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
        <div style={CARD}>
          <Skeleton w="140px" h={14} r={4} />
          {[...Array(4)].map((_, i) => <Skeleton key={i} w="100%" h={24} r={6} />)}
        </div>
        <div style={CARD}>
          <Skeleton w="140px" h={14} r={4} />
          {[...Array(5)].map((_, i) => <Skeleton key={i} w="100%" h={36} r={8} />)}
        </div>
      </div>
    </div>
  )
}

function NewsletterSkeleton() {
  return (
    <div>
      <KpiRow />
      <ChartCard />
    </div>
  )
}

export function TabSkeleton({ tab }: { tab: DashboardTab }) {
  switch (tab) {
    case 'agentes': return <AgentesSkeleton />
    case 'emails': return <EmailsSkeleton />
    case 'fuentes': return <FuentesSkeleton />
    case 'newsletter': return <NewsletterSkeleton />
    default: return <GeneralSkeleton />
  }
}
