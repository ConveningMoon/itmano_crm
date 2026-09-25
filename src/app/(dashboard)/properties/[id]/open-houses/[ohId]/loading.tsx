import { Skeleton } from '@/components/ui/skeleton'

// Forma real del detalle de un open house: encabezado, panel de confirmación
// y tarjetas de correo.

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
  padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
}

export default function OpenHouseDetailLoading() {
  return (
    <>
      <div style={{ marginBottom: '20px' }}><Skeleton w="140px" h={13} r={4} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
        <Skeleton w="340px" h={22} r={4} />
        <Skeleton w="220px" h={13} r={3} />
        <Skeleton w="280px" h={18} r={9} />
      </div>

      <div style={{ ...CARD, marginBottom: '28px' }}>
        <Skeleton w="160px" h={14} r={4} />
        <Skeleton w="100%" h={12} r={3} />
        <Skeleton w="140px" h={30} r={8} />
      </div>

      <Skeleton w="80px" h={15} r={4} />
      {[...Array(2)].map((_, i) => (
        <div key={i} style={{ ...CARD, marginTop: '12px' }}>
          <Skeleton w="180px" h={14} r={4} />
          <Skeleton w="240px" h={12} r={3} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton w="110px" h={30} r={8} />
            <Skeleton w="110px" h={30} r={8} />
          </div>
        </div>
      ))}
    </>
  )
}
