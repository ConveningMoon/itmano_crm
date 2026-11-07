import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { SupportFormSkeleton } from './support-skeleton'

export default function SoporteLoading() {
  return (
    <>
      <PageHeaderSkeleton width="190px" />
      <SupportFormSkeleton />
    </>
  )
}
