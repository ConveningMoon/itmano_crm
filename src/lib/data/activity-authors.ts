import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthEmailsByIds } from '@/lib/auth/admin-users'

export const SYSTEM_AUTHOR = 'Sistema'

// Batch-resolves a set of actor user ids to a display name (no N+1):
//   linked agent (agents.user_id) → the agent's name; else → the auth user's email.
// null actors are not resolved here — callers use authorOf() → SYSTEM_AUTHOR.
export async function resolveActorNames(
  actorIds: (string | null)[],
): Promise<Record<string, string>> {
  const ids = [...new Set(actorIds.filter((x): x is string => !!x))]
  if (ids.length === 0) return {}

  const supabase = createAdminClient()
  const out: Record<string, string> = {}

  // 1. Agents linked to these logins.
  const { data: agents } = await supabase.from('agents').select('user_id, name').in('user_id', ids)
  for (const a of (agents ?? []) as { user_id: string; name: string }[]) out[a.user_id] = a.name

  // 2. Remaining (owner/super logins not tied to an agent row) → auth email.
  const missing = ids.filter(id => !out[id])
  if (missing.length > 0) {
    const emails = await getAuthEmailsByIds(missing)
    for (const id of missing) if (emails[id]) out[id] = emails[id]
  }
  return out
}

// Resolves one actor id to its display label using a pre-resolved name map.
export function authorOf(actorUserId: string | null, names: Record<string, string>): string {
  if (!actorUserId) return SYSTEM_AUTHOR
  return names[actorUserId] ?? 'Usuario'
}
