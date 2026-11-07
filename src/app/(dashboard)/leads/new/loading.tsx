import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { NewLeadFormSkeleton } from './new-lead-skeleton'

export default function NewLeadLoading() {
  return (
    <>
      <PageHeaderSkeleton width="180px" />
      <NewLeadFormSkeleton />
    </>
  )
}
