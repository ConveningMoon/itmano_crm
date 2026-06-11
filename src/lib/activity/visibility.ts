import type { TenantRole } from '@/lib/auth/tenant-context'

export interface ActivityViewer {
  role:   TenantRole
  userId: string
}

// Role-based activity visibility. agent_owner and super_admin see every activity.
// An 'agent' sees only system activities (actor null) and their OWN — never those
// authored by other humans. This is the single source of truth; the data layer
// applies the equivalent SQL filter, and this pure function backs the unit tests.
export function isEventVisibleToViewer(
  viewer: ActivityViewer,
  actorUserId: string | null,
): boolean {
  if (viewer.role !== 'agent') return true
  return actorUserId === null || actorUserId === viewer.userId
}
