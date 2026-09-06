import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div style={{ maxWidth: '520px', paddingTop: '40px' }}>
      {[100, 200, 320, 240, 80].map((w, i) => (
        <Skeleton
          key={i}
          w={`${w}px`}
          h={i === 0 ? 28 : i === 4 ? 36 : 44}
          style={{ marginBottom: i === 0 ? '28px' : '16px', maxWidth: '100%' }}
        />
      ))}
    </div>
  )
}
