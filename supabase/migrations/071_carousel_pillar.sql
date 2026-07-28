-- 071 · Pilar de contenido por carrusel (para no repetir el ángulo narrativo).
--
-- Renumerada de 069 a 071: dos ramas paralelas reclamaron el 069 a la vez
-- (069_ai_briefings es la otra) y el 070 ya estaba tomado por paddle_billing.
-- La columna ya existe en el proyecto remoto — se aplicó suelta, sin quedar
-- registrada en supabase_migrations.schema_migrations — y este archivo es
-- idempotente (`add column if not exists`), así que re-aplicarlo no hace daño.
--
-- Cada carrusel se clasifica en un "pilar" (tomado del sistema v2 de Adriana:
-- datos de mercado, cultura pop, chisme/curiosidad, ley/política, estrategia
-- financiera, cultural/familiar). Al generar, se muestran los pilares y temas
-- recientes del agente para que la IA rote a un pilar distinto y evite repetir
-- temas — así se ataca tanto la repetición literal como la fatiga de ángulo.
alter table carousel_jobs
  add column if not exists pillar text;
