-- Migration 044: Performance — FK covering indexes + RLS initplan fixes
--
-- Addresses Supabase database-linter PERFORMANCE advisories:
--   0001 unindexed_foreign_keys — add covering indexes for FK columns that had none
--   0003 auth_rls_initplan       — wrap auth.*()/helper calls in scalar subqueries
--                                   so they evaluate once per query, not once per row
--
-- No behavioural change: indexes are pure performance; the RLS rewrites are
-- semantically identical (documented Supabase optimization — only the evaluation
-- plan changes, not the access-control logic).

-- ---------------------------------------------------------------------------
-- FK covering indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS acquisition_channels_agent_id_idx
  ON public.acquisition_channels (agent_id);
CREATE INDEX IF NOT EXISTS acquisition_channels_email_sequence_id_idx
  ON public.acquisition_channels (email_sequence_id);
CREATE INDEX IF NOT EXISTS email_sequence_steps_tenant_id_idx
  ON public.email_sequence_steps (tenant_id);
CREATE INDEX IF NOT EXISTS email_sequences_agent_id_idx
  ON public.email_sequences (agent_id);
CREATE INDEX IF NOT EXISTS email_sequences_tenant_id_idx
  ON public.email_sequences (tenant_id);
CREATE INDEX IF NOT EXISTS invitations_agent_id_idx
  ON public.invitations (agent_id);
CREATE INDEX IF NOT EXISTS invitations_invited_by_idx
  ON public.invitations (invited_by);
CREATE INDEX IF NOT EXISTS lead_email_replies_tenant_id_idx
  ON public.lead_email_replies (tenant_id);
CREATE INDEX IF NOT EXISTS user_profiles_tenant_id_idx
  ON public.user_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS properties_created_by_user_id_idx
  ON public.properties (created_by_user_id);
-- Existing notifications_agent_id_idx is (tenant_id, agent_id); it cannot serve an
-- agent_id-only FK cascade lookup, so add a dedicated partial index on agent_id.
CREATE INDEX IF NOT EXISTS notifications_agent_id_fk_idx
  ON public.notifications (agent_id) WHERE agent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS initplan fixes — wrap volatile calls in (SELECT ...) scalar subqueries
-- ---------------------------------------------------------------------------
ALTER POLICY user_profiles_select ON public.user_profiles
  USING (
    (id = (SELECT auth.uid()))
    OR (SELECT public.is_super_admin())
  );

ALTER POLICY notifications_select ON public.notifications
  USING (
    (SELECT public.is_super_admin())
    OR (
      (tenant_id = (SELECT public.get_my_tenant_id()))
      AND (
        (
          (SELECT user_profiles.role
             FROM public.user_profiles
            WHERE user_profiles.id = (SELECT auth.uid())) <> 'agent'::text
        )
        OR (
          agent_id = (
            SELECT agents.id
              FROM public.agents
             WHERE agents.user_id = (SELECT auth.uid())
               AND agents.tenant_id = (SELECT public.get_my_tenant_id())
          )
        )
      )
    )
  );
