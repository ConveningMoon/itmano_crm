-- 096 · La columna que la 095 debía traer y no trajo.
--
-- El spec de templates la especificaba junto a las columnas de portada del
-- agente, pero el archivo de la 095 solo incluyó estas últimas. `generate.ts`
-- inserta `template` en cada pieza, así que guardar un diseño fallaba con
-- "column template does not exist" — la previsualización no, porque no toca la
-- base, que es justo lo que hizo el fallo difícil de ver.
--
-- null = la pieza se dibujó con el compositor de bandas: las recetas `event` y
-- `open_prompt`, y todo lo creado antes de los templates.

alter table studio_images
  add column if not exists template text;
