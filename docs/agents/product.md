# Producto, estado y voz

## Qué es ITMANO

ITMANO es un Growth Partner premium para el sector inmobiliario. Vende
infraestructura de adquisición, calificación, nurturing y conversión; el CRM
white-label es la superficie visible y el diferenciador frente a un reporte
mensual. Debe sentirse premium, considerado y propio del sector, no como una
plantilla SaaS genérica.

El producto es sales-led: no existe registro autoservicio. La fuente de verdad
de planes, precios y features es `src/lib/plans.ts`, no este documento. Los
planes son Esencial, Growth y Partner. Los nuevos clientes entran a una prueba
de 14 días sobre la experiencia Growth para no depender de provisionar un
dominio propio de envío.

Los límites de leads, emails y propiedades son contractuales. El presupuesto de
IA sí se aplica en código. ITMANO paga ese consumo; consulta `ai_usage_events`
antes de cambiar precios, modelos o límites.

## Estado operativo

- Producción: `https://app.itmano.com`.
- Tenant piloto: A&J Real Estate Group, Hampton Roads, Virginia.
- El CRM opera scoring, pipeline por etapas, importación CSV/XLSX, secuencias de
  email, propiedades, canales, analytics, notificaciones, super-admin e IA.
- No hay suscripciones Supabase Realtime en `src/` ni tablas publicadas para el
  proyecto. La UI refresca mediante Server Actions, `router.refresh()` o polling
  controlado. Verifica este hecho en código y base antes de afirmarlo en el
  futuro.
- Paddle está integrado en código, pero el estado comercial de suscripciones
  reales puede cambiar y debe verificarse antes de tomar decisiones.
- Las páginas legales contienen datos UAE pendientes de revisión legal. No las
  presentes como asesoría ni como documentos finales sin confirmación.

La fase activa es comercialización. No empieces sin petición explícita el
onboarding automático de tenants, analytics avanzado, campañas de reactivación,
AWS SES, WhatsApp, ManyChat o signup autoservicio.

## Principios de experiencia

- El dashboard es el producto visible; protege el pulido del tenant piloto sin
  introducir acoplamiento a su identidad.
- `super_admin` es un rol interno de ITMANO y nunca se asigna a clientes.
- El producto debe seguir funcionando cuando campos opcionales de perfil estén
  vacíos. La ausencia de datos no se interpreta como una respuesta negativa.

## Voz de marca

Todo copy visible para clientes usa español neutro latino salvo una preferencia
configurada en el tenant.

- Tono premium, estratégico, calmado y concreto.
- Sin hype, marketing-speak, chistes en empty states ni emojis.
- Para lenguaje comercial de dinero, usa “inversión” cuando corresponda; evita
  términos que contradigan el posicionamiento aprobado.
- Usa números y consecuencias concretas cuando ayuden.
- Las variantes regionales pertenecen a configuración del tenant, nunca a
  condicionales hardcodeados para una agencia.
