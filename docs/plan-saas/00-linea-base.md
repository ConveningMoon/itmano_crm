# Línea base medida el 2026-11-18

Foto del sistema antes de empezar el plan. Producción consultada en solo
lectura; Vercel, sólo nombres de variables. Vuelve a medir antes de decidir:
estos números envejecen.

## Tenants en producción

| Tenant | Plan | Estado | Cuenta Resend | Leads | Agentes / logins | Propiedades publicadas |
|---|---|---|---|---|---|---|
| A&J Real Estate Group | Partner | activa, `billing_exempt` | `aj` (cuenta propia, Free) | 177 | 5 / 3 | 13 |
| Tenant Test | Esencial | activa | `itmano` | 30 | 1 / 1 | 1 (Esencial no incluye propiedades web) |

## Consumo

- IA (Anthropic + Google) de toda la plataforma: menos de $1 al mes desde julio.
  El mes más alto fue septiembre (~$0.61, sobre todo "Crear propiedad con IA").
- Correos registrados en `email_sends`: 11 en septiembre, 5 en octubre y 5 en
  noviembre. Los Magic Links **no** se registran en ninguna tabla, y
  `auth.audit_log_entries` está vacía.

## Storage (límite Free: 1 GB)

| Bucket | Archivos | MB | Nota |
|---|---|---|---|
| property-media | 525 | 220 | 504 WebP (media 433 KB, máx. 2.3 MB) y 20 PDF |
| studio-images | 11 | 13 | Plantillas PNG |
| newsletter-media | 4 | 5 | JPEG/PNG sin convertir (hasta 3.1 MB) |
| tenant-assets | 15 | 5 | Logos y fotos |

- A&J: 13 propiedades, 464 archivos referenciados (196 MB). Son unas 35 fotos
  por propiedad y ~15 MB por propiedad.
- **61 archivos huérfanos (24 MB, 11%)** en `property-media` no los referencia
  ninguna propiedad.
- Base de datos: ~21 MB (límite Free: 500 MB).

## Variables de Vercel (`itmano-crm`, producción)

- Faltan: todas las `PADDLE_*`, `RESEND_INBOUND_API_KEY`,
  `RESEND_INBOUND_API_KEY_ITMANO` y `WEBFLOW_WEBHOOK_SECRET`.
- Sobran: `SUPABASE_JWT_SECRET` (sólo la usan las pruebas), `CONTACT_FORM_FROM`
  y `SUPPORT_FORM_TO` (ya no las lee el código).

## Lo que los planes prometen y el código no aplica

| Promesa | ¿Se aplica? |
|---|---|
| Presupuesto de IA por plan | Sí (`ai-limit.ts`) |
| Correos al mes | Sólo en correos grupales (`quota.ts`) |
| Logins / agentes | Agregar agentes exige Partner; contradice "3 agentes rastreados" de Growth |
| Leads, propiedades web, IA de propiedades, sincronización web, analytics completo o de equipo | No |

## Proveedores: qué se puede medir

| Proveedor | Cómo medir | Saldo prepagado por API |
|---|---|---|
| Resend | Cabeceras `x-resend-daily-quota` (sólo plan Free) y `x-resend-monthly-quota` en cada respuesta de la API | No aplica (plan mensual) |
| Supabase Auth (Magic Links) | No queda registro en la base. Send Email Hook o logs de Auth | — |
| Anthropic | `ai_usage_events` propio (tiempo real) + Usage & Cost Analytics de la Admin API (retraso de 4 a 24 h; requiere llave `sk-ant-admin`) | **No existe endpoint de saldo** |
| Google AI (Gemini) | `ai_usage_events` propio + Cloud Billing Budget API con alertas a Pub/Sub (retraso de hasta 24 h) | **No documentado**; el saldo prepago sólo se ve en AI Studio |
| Supabase | SQL sobre `storage.objects` y `pg_database_size` (tiempo real). El egress sólo en el panel | — |
| Vercel | API/MCP de uso y facturación | — |

## Referencias de precios (verificar antes de decidir)

- Resend Free: 3.000 correos/mes, 100/día y 1 dominio (algunas fuentes dicen
  3). Pro: $20/mes, 50.000/mes, sin tope diario y ~10 dominios. Scale: ~$90.
- Supabase Pro: $25/mes, 8 GB de base, 100 GB de Storage, 250 GB de egress
  (cuota única), backups diarios de 7 días.
- Supabase Auth con SMTP propio: límite por defecto de unos 30 correos de Auth
  por hora, configurable en Authentication → Rate Limits.
