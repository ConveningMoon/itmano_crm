import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { NewLeadFormSkeleton } from './new-lead-skeleton'

export default function NewLeadLoading() {
  return (
    <div className="form-narrow">
      <PageHeaderSkeleton width="180px" />
      <NewLeadFormSkeleton />
    </div>
  )
}
