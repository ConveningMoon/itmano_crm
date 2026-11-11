import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { LeadsListSkeleton } from './leads-skeleton'

export default function LeadsLoading() {
  return (
    <>
      <PageHeaderSkeleton width="120px" />
      <LeadsListSkeleton />
    </>
  )
}
