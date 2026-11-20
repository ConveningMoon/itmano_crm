# Fase 4 — Storage: optimización y limpieza

**Objetivo:** que cada cliente ocupe la mitad o menos de lo que ocupa hoy, sin
basura acumulada y sin perder calidad visible, para llegar a Supabase Pro
(fase 11) con margen y aguantar mientras tanto en el plan Free.

## Situación (2026-11-18)

- A&J ocupa ~220 MB de 1 GB: 13 propiedades × ~35 fotos × ~433 KB (WebP 2560 px,
  calidad 82). **Un cliente nuevo con 50 propiedades así ocuparía ~750 MB y
  no cabría en Free.**
- 61 archivos huérfanos (24 MB, 11%).
- Las webs externas de los clientes cargan las fotos directo desde Supabase
  Storage a tamaño completo: eso gasta **egress** (Free 5 GB/mes, Pro 250 GB),
  que puede llegar antes que el límite de almacenamiento.

## ¿Supabase Pro es suficiente?

Sí, con mucho margen para almacenamiento: 100 GB caben ~450 clientes del
tamaño de A&J hoy, o ~900 después de esta fase. La base (8 GB contra 21 MB)
no es problema. Lo que hay que vigilar es el **egress**: medirlo en el panel
de Supabase antes y después de esta fase y añadirlo a `provider_settings`.

## Tareas

- [ ] **Medir egress** actual en Supabase → Usage y anotarlo en el Registro
      del README.
- [ ] **Huérfanos:** cron semanal que detecte objetos de `property-media`,
      `newsletter-media` y `tenant-assets` sin referencia (`properties.image_url`,
      `gallery`, `detail_pdf_url`, `newsletter_editions`, `tenants.logo_url`,
      `agents.cover_photo_url`, `studio_*`) con más de 7 días de antigüedad.
      Primero sólo informar al panel. Borrar automáticamente sólo tras aprobar
      Dylan la política: es un borrado masivo, sujeto a la regla de
      confirmación de `AGENTS.md`.
- [ ] **Borrar al borrar:** al eliminar una propiedad, una foto de la galería,
      una edición o un logo, borrar su objeto en el mismo flujo. Buscar cada
      punto de borrado con `rg`.
- [ ] **Fotos más ligeras:** bajar `MAX_IMAGE_DIMENSION` de 2560 a 1920 px y
      calidad a ~78 (medir antes en 20 fotos reales: tamaño y comparación
      visual). Estimado: −40 a −50% por foto. Aplica también a
      `newsletter-media`, que hoy guarda JPEG/PNG de hasta 3 MB sin convertir.
- [ ] **Recompresión de lo existente** (opcional y con aprobación): script
      idempotente que reprocesa las fotos de A&J a la nueva especificación,
      con copia previa y en sandbox primero. Ahorro estimado: ~100 MB.
- [ ] **Tope por propiedad según plan** (con la fase 6): p. ej. 25 fotos en
      Growth y 40 en Partner. Hoy hay propiedades con ~35.
- [ ] **Egress de las webs externas:** que `integration-prompt.ts` entregue
      URLs servidas por el dominio de la app con transformación (p. ej.
      `/_next/image` con `w` y `q`, o una ruta propia cacheada en CDN) en
      lugar del objeto original de Supabase. Vercel cachea la transformación,
      y el egress de Supabase pasa a ser una descarga por imagen y tamaño.
      Medir el costo de Image Optimization en Vercel Pro antes de activarlo.
- [ ] Mostrar Storage por tenant en el panel (fase 2) y en Configuración del
      propio cliente ("Tu almacenamiento").

## Criterio de terminado

- Huérfanos reportados en el panel; borrado automático sólo si Dylan lo aprobó.
- Una foto nueva típica pesa ≤ 250 KB sin pérdida visible.
- La web pública de una propiedad no descarga el original de Supabase.
- `tests/uploads` actualizado y en verde.
