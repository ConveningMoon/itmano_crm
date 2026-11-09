import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { NewslettersSkeleton } from './newsletters-skeleton'

export default function NewslettersLoading() {
  return (
    <>
      <PageHeaderSkeleton width="160px" />
      <NewslettersSkeleton />
    </>
  )
}
