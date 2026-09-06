import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Normalize an email for comparison/storage: trim + lowercase. Mirrors the
// extractEmail normalization used elsewhere so lookups match consistently.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Find an auth user by email.
 *
 * The Supabase admin API (v2.106) has NO getUserByEmail. We loop over listUsers
 * pages until the email is found or the results are exhausted — never assuming a
 * single "big enough" page (that would silently miss users once multiple tenants'
 * agents exist). Centralized here so a future getUserByEmail is a one-line swap.
 */
export async function findAuthUserByEmail(
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target   = normalizeEmail(email)
  const supabase = createAdminClient()
  const perPage  = 200

  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`listUsers failed: ${error.message}`)

    const users = data?.users ?? []
    const match = users.find(u => normalizeEmail(u.email ?? '') === target)
    if (match) return { id: match.id, email: match.email ?? target }

    // A short page (or empty) means we've reached the end.
    if (users.length < perPage) return null
  }
}

/**
 * Resolves a set of auth user ids to their emails in one pass (batch, no N+1).
 * Loops listUsers pages, stopping early once all requested ids are found.
 */
export async function getAuthEmailsByIds(ids: string[]): Promise<Record<string, string>> {
  const want = new Set(ids.filter(Boolean))
  const out: Record<string, string> = {}
  if (want.size === 0) return out

  const supabase = createAdminClient()
  const perPage  = 200
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = data?.users ?? []
    for (const u of users) {
      if (want.has(u.id) && u.email) out[u.id] = u.email
    }
    if (users.length < perPage) break
    if (Object.keys(out).length >= want.size) break
  }
  return out
}
