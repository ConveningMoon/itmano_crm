import type { TenantContext } from '@/lib/auth/tenant-context'
import type { PeriodDays } from '@/lib/dashboard/period'

export interface TabProps {
  ctx: TenantContext
  period: PeriodDays
}
