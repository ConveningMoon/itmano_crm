'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Clears the Supabase session cookies (server-side, so they actually clear — unlike
// in a Server Component) and bounces to /login. Any later navigation to a protected
// page is caught by the proxy and redirected to /login as well.
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
