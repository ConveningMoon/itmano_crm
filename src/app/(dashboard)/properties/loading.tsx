import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { PropertiesListSkeleton } from './properties-skeleton'

export default function PropertiesLoading() {
  return (
    <>
      <PageHeaderSkeleton width="160px" />
      <PropertiesListSkeleton />
    </>
  )
}
