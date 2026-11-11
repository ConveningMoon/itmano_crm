import { PageHeaderSkeleton } from '@/components/ui/page-skeleton'
import { AdminSkeleton } from './admin-skeleton'

export default function AdminLoading() {
  return (
    <>
      <PageHeaderSkeleton width="210px" />
      <AdminSkeleton />
    </>
  )
}
