-- Un envío grupal pausado por rebotes o quejas se puede reanudar. Reanudar es
-- una decisión de una persona que ya vio el motivo: desde ese momento la guarda
-- deja de evaluarse para ese envío. Sin esta marca volvería a pausarse en el
-- primer lote, porque los rebotes que la dispararon siguen contando.

alter table public.email_broadcasts
  add column if not exists guard_overridden_at timestamptz;
