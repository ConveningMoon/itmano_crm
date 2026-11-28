-- Fase 6: coherencia de trial_ends_at con el estado 'expired'.
--
-- La restriccion original (055) exigia (status = 'trial') = (trial_ends_at is not null),
-- lo que impide marcar una prueba vencida como 'expired' conservando su fecha.
-- Nueva regla: trial y expired exigen vencimiento (en expired ancla el fin de la
-- prueba); cualquier otro estado no lo usa.

alter table subscriptions drop constraint if exists subscriptions_trial_ends_at_coherent;
alter table subscriptions add constraint subscriptions_trial_ends_at_coherent
  check ((status in ('trial', 'expired')) = (trial_ends_at is not null));
