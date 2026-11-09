import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { StudioSkeleton } from './studio-skeleton'

export default function StudioLoading() {
  return (
    <>
      <PageHeaderSkeleton width="120px" />
      <StudioSkeleton />
    </>
  )
}
