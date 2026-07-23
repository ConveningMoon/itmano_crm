-- 069 · Pilar de contenido por carrusel (para no repetir el ángulo narrativo).
--
-- Cada carrusel se clasifica en un "pilar" (tomado del sistema v2 de Adriana:
-- datos de mercado, cultura pop, chisme/curiosidad, ley/política, estrategia
-- financiera, cultural/familiar). Al generar, se muestran los pilares y temas
-- recientes del agente para que la IA rote a un pilar distinto y evite repetir
-- temas — así se ataca tanto la repetición literal como la fatiga de ángulo.
alter table carousel_jobs
  add column if not exists pillar text;
