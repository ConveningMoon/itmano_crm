import { createClient } from '@supabase/supabase-js'
import { supabaseTraceFetch } from './trace'

// Server-only admin client — bypasses RLS. Never import in client components.
// Auth protection is provided by middleware (src/middleware.ts).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { fetch: supabaseTraceFetch('admin') },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
