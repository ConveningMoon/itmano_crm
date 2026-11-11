import { Skeleton } from '@/components/ui/skeleton'

// Forma del formulario de soporte mientras llega la sesión (loading.tsx y el
// Suspense de la página).
export function SupportFormSkeleton() {
  return (
    <div className="settings-card form-card" aria-hidden="true">
      <Skeleton w="100%" h={34} />
      <Skeleton w="100%" h={34} />
      <Skeleton w="100%" h={110} />
      <Skeleton w="140px" h={34} />
    </div>
  )
}
