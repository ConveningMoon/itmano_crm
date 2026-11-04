import { Skeleton } from '@/components/ui/skeleton'
import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
  padding: '20px', marginBottom: '16px',
}

export default function BroadcastLoading() {
  return (
    <>
      <Skeleton w="120px" h={12} r={3} />
      <div style={{ height: '12px' }} />
      <PageHeaderSkeleton width="180px" />

      {/* Nombre */}
      <div style={CARD}>
        <Skeleton w="70px" h={10} r={3} />
        <div style={{ height: '10px' }} />
        <Skeleton w="100%" h={34} r={8} />
      </div>

      {/* Audiencia: chips de criterios y conteo */}
      <div style={CARD}>
        <Skeleton w="90px" h={12} r={3} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '16px 0' }}>
          {['84px', '110px', '72px', '96px', '120px', '80px'].map((w, i) => <Skeleton key={i} w={w} h={28} r={999} />)}
        </div>
        <Skeleton w="240px" h={12} r={3} />
      </div>

      {/* Contenido por idioma */}
      <div style={CARD}>
        <Skeleton w="90px" h={12} r={3} />
        <div style={{ height: '14px' }} />
        <Skeleton w="100%" h={48} r={8} />
      </div>

      {/* Envío */}
      <div style={CARD}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Skeleton w="110px" h={34} r={8} />
          <Skeleton w="130px" h={34} r={8} />
        </div>
      </div>
    </>
  )
}
