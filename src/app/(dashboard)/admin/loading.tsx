import { PageHeaderSkeleton, StatCardsSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

export default function AdminLoading() {
  return (
    <>
      <PageHeaderSkeleton width="210px" />
      <StatCardsSkeleton count={4} />
      <ListCardSkeleton rows={6} />
    </>
  )
}
