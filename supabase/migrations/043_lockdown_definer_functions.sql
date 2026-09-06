-- Migration 043: Lock down SECURITY DEFINER functions
--
-- WHY: The Supabase project grants EXECUTE to `anon` and `authenticated` by
-- default on every new function in `public`. Migration 008 only revoked the
-- test helpers FROM PUBLIC, which does NOT remove those default named-role
-- grants. As a result the anon key (shipped in the browser bundle) could call:
--   - rls_test_delete_user(email)      → delete ANY auth user by email
--   - rls_test_create_user(email, pw)  → create arbitrary auth users
--   - rls_test_get_user_id(email)      → enumerate accounts
--   - decay_lead_scores()              → mutate every tenant's lead scores
-- and reach several trigger/definer helpers that were never meant to be RPCs.
--
-- This migration explicitly revokes EXECUTE from anon + authenticated + PUBLIC
-- on functions that must not be publicly callable, and pins search_path on all
-- SECURITY DEFINER functions (prevents search_path hijacking, clears the
-- database linter's function_search_path_mutable warnings).
--
-- Roles kept:
--   - service_role: retains EXECUTE on everything (bypasses these grants anyway).
--   - authenticated: keeps recompute_lead_score (called from server actions);
--     keeps is_super_admin / get_my_tenant_id (invoked inside RLS policies).

-- ---------------------------------------------------------------------------
-- Part A — test-only helpers (never called by the application)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rls_test_create_user(text, text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_test_delete_user(text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_test_get_user_id(text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_test_mint_jwt(text)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_test_mint_jwt(text, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_jwt_sign(json, text)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_jwt_base64url_encode(bytea)    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part B — operational RPCs that must not be public
-- ---------------------------------------------------------------------------
-- Cron-only (now invoked via the service-role admin client, see score-decay route)
REVOKE ALL ON FUNCTION public.decay_lead_scores(boolean)         FROM PUBLIC, anon, authenticated;
-- Debug-only, no application caller
REVOKE ALL ON FUNCTION public.recalc_lead_score(text)            FROM PUBLIC, anon, authenticated;
-- Called by server actions (authenticated) and intake (service_role); drop anon only
REVOKE ALL ON FUNCTION public.recompute_lead_score(text)         FROM PUBLIC, anon;

-- Trigger functions — fire as table owner regardless of grants; never valid as RPCs
REVOKE ALL ON FUNCTION public.apply_lead_event_scoring()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_lead_status_history()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_telegram_on_insert()        FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Part C — pin search_path on SECURITY DEFINER + flagged functions
-- Every cross-schema reference in these bodies (net., vault., auth.) is already
-- schema-qualified, so `public` (with implicit pg_catalog) is sufficient.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.get_my_tenant_id()                    SET search_path = public;
ALTER FUNCTION public.is_super_admin()                      SET search_path = public;
ALTER FUNCTION public.decay_lead_scores(boolean)            SET search_path = public;
ALTER FUNCTION public.recalc_lead_score(text)               SET search_path = public;
ALTER FUNCTION public.recompute_lead_score(text)            SET search_path = public;
ALTER FUNCTION public.apply_lead_event_scoring()            SET search_path = public;
ALTER FUNCTION public.record_lead_status_history()          SET search_path = public;
ALTER FUNCTION public.notify_telegram_on_insert()           SET search_path = public;
ALTER FUNCTION public.update_updated_at()                   SET search_path = public;
ALTER FUNCTION public.cancel_runs_on_lead_event()           SET search_path = public;
ALTER FUNCTION public.cancel_runs_on_lead_status_change()   SET search_path = public;
ALTER FUNCTION public.guard_lead_event_dedup()              SET search_path = public;
ALTER FUNCTION public.rls_jwt_base64url_encode(bytea)       SET search_path = public;
ALTER FUNCTION public.rls_jwt_sign(json, text)              SET search_path = public, extensions;
ALTER FUNCTION public.rls_test_create_user(text, text)      SET search_path = public, extensions;
ALTER FUNCTION public.rls_test_delete_user(text)            SET search_path = public;
ALTER FUNCTION public.rls_test_get_user_id(text)            SET search_path = public;
ALTER FUNCTION public.rls_test_mint_jwt(text)               SET search_path = public, extensions;
ALTER FUNCTION public.rls_test_mint_jwt(text, text)         SET search_path = public, extensions;
