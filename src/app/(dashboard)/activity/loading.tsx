import { PageHeaderSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

export default function ActivityLoading() {
  return (
    <>
      <PageHeaderSkeleton width="180px" />
      <ListCardSkeleton rows={12} />
    </>
  )
}
