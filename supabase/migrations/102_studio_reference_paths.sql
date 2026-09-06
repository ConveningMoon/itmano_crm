-- 102 · Varias imágenes de referencia por pieza (hasta 3).
--
-- `reference_path` guardaba UNA sola: era el modelo de la pestaña de recetas,
-- donde la referencia respondía a "¿esta es la casa?". La pestaña "Mi Imagen"
-- pide otra cosa —"combina estas tres"— y con una sola columna la variante de
-- una pieza (`regenerateStudioImage`, que rebaja las referencias del bucket)
-- perdería en silencio la segunda y la tercera.
--
-- `reference_path` se conserva y se sigue escribiendo con la PRIMERA: las filas
-- anteriores solo tienen esa, y ninguna lectura vieja tiene que cambiar.

alter table studio_images
  add column if not exists reference_paths text[];

comment on column studio_images.reference_paths is
  'Todas las referencias de la pieza, en orden. reference_path repite la primera por compatibilidad.';
