-- 067 · Prompt de estilo/diseño editable por agente (Carousel Engine).
--
-- Hasta ahora las reglas del sistema de diseño v2 (cómo se escribe y se compone
-- el carrusel) vivían solo en código (V2_COPY_RULES en src/lib/carousels/brand.ts).
-- Este campo permite editarlas/mejorarlas por agente desde la UI. Si es NULL, el
-- motor usa el default del código. Las REGLAS DURAS de cumplimiento (no inventar
-- datos, no rostros reales) NO son editables: se siguen aplicando siempre en
-- código, se sobreescriba o no este prompt.
alter table carousel_brand_profiles
  add column if not exists style_prompt text;
