import { PageHeaderSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

export default function NotificationsLoading() {
  return (
    <>
      <PageHeaderSkeleton width="170px" />
      <ListCardSkeleton rows={10} />
    </>
  )
}
