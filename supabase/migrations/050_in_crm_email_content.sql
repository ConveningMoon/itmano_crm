-- 050 · Contenido de correos dentro del CRM (composer estructurado).
--
-- Hasta ahora TODO el contenido de correos vivía en templates de Resend
-- (email_sequence_steps.resend_template_id y purchase_email_templates.
-- resend_template_id). Este cambio permite crear el contenido en el CRM:
-- subject + body_json (párrafos, CTA opcional, firma) que el servidor compila
-- a HTML con branding del tenant y footer de unsubscribe automático
-- (src/lib/services/email-render.ts). Los template IDs de Resend siguen
-- funcionando como modo legacy/avanzado; la precedencia es body_json > template.
--
-- body_json shape (validado con zod en cada write):
--   { "v": 1, "paragraphs": ["..."], "cta": { "label": "...", "url": "..." } | null,
--     "include_signature": true }

-- ── 1. Steps de secuencia: cuerpo estructurado ────────────────────────────────
-- subject ya existe (nullable desde 023, era la columna legacy compose-in-CRM).
alter table email_sequence_steps
  add column if not exists body_json jsonb;

-- ── 2. Correos de hitos de compra: mismos campos del composer ─────────────────
alter table purchase_email_templates
  add column if not exists subject   text,
  add column if not exists body_json jsonb;

-- ── 3. email_sends: discriminador de origen + snapshot del asunto ─────────────
-- sequence_run_id y step_order ya son nullable (014) — una fila one-off o de
-- compra encaja con refs de secuencia en null. El webhook de Resend sigue
-- atribuyendo clicks/replies por resend_email_id sin cambios.
alter table email_sends
  add column if not exists send_type text not null default 'sequence',
  add column if not exists subject   text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_sends_send_type_check'
  ) then
    alter table email_sends
      add constraint email_sends_send_type_check
      check (send_type in ('sequence', 'purchase', 'one_off'));
  end if;
end $$;

-- ── 4. Fix: CHECK de lead_sequence_runs.cancelled_reason ──────────────────────
-- Bug latente: pauseRun (send-sequence-email.ts) escribe 'no_step',
-- 'no_template', 'no_from_address' y 'resend_error: <msg>' — ninguno permitido
-- por el CHECK de 023/039 — así que el UPDATE fallaba en silencio y los runs
-- "pausados" seguían active reintentando cada hora. Se agregan las razones
-- operativas (el detalle del error de Resend va al log, no a la columna) y la
-- nueva 'no_content' (paso sin body_json NI template).
alter table lead_sequence_runs
  drop constraint if exists lead_sequence_runs_cancelled_reason_check;

alter table lead_sequence_runs
  add constraint lead_sequence_runs_cancelled_reason_check
  check (
    cancelled_reason is null
    or cancelled_reason = any (array[
      'unsubscribed', 'replied', 'lead_closed', 'manual', 'sequence_deleted',
      'hard_bounce', 'spam_complaint', 'email_blocked',
      'no_step', 'no_template', 'no_content', 'no_from_address', 'resend_error'
    ])
  );
