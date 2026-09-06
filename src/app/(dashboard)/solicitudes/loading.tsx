import { PageHeaderSkeleton, ListCardSkeleton } from '@/components/ui/page-skeleton'

export default function SolicitudesLoading() {
  return (
    <>
      <PageHeaderSkeleton width="160px" />
      <ListCardSkeleton rows={8} />
    </>
  )
}
