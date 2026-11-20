import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { OperacionSkeleton } from './operacion-skeleton'

export default function OperacionLoading() {
  return (
    <>
      <PageHeaderSkeleton width="140px" />
      <OperacionSkeleton />
    </>
  )
}
