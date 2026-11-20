# Fase 8 — Alta y onboarding autoservicio

**Objetivo:** pagar, configurar y usar sin hablar con ITMANO. Es la fase
grande: conviene dividirla en sub-PRs (8A a 8F).

## Decisiones previas

- **D2** — Prueba sin tarjeta (recomendado) con email verificado, $25 de IA,
  dominio compartido y degradación al día 15 (D5).
- **D3** — Partner con precio de catálogo y asientos.
- Antiabuso: rate limit por IP y por email, bloqueo de dominios de email
  desechables y, si hace falta, Vercel BotID en el formulario.

## 8A — Registro

- [ ] `/registro` público (marketing): nombre del negocio, email y plan
      elegido (o "probar 14 días"). Crea el usuario con Magic Link
      (`shouldCreateUser: true` **sólo** en este flujo; el login sigue cerrado
      a registros) y, al confirmar el email, crea el tenant con la lógica de
      `createTenant` extraída a un servicio compartido con el Centro de control.
- [ ] Slug generado desde el nombre, único, editable en el onboarding.
- [ ] Si eligió un plan de pago: checkout de Paddle tras crear el tenant (fase 5).
- [ ] El `super_admin` recibe un aviso de Telegram por alta nueva.

## 8B — Asistente de configuración (checklist persistente)

Una tarjeta "Configura tu cuenta" en el dashboard con pasos que se marcan
solos al cumplirse (no por clic), guardados en `tenant_onboarding_steps` o
derivados de los datos:

1. Marca: logo, color y nombre visible.
2. Tu negocio: zona horaria, áreas, presupuestos, idiomas y dirección postal
   (obligatoria para correos grupales, CAN-SPAM).
3. Tu equipo (Partner): invitar agentes con su email; cada uno recibe su
   Magic Link. Agentes sin login en Growth según la fase 6.
4. Avisos: conectar Telegram (fase 7).
5. Tu web: elegir plataforma y copiar el script o prompt de integración que
   ya genera el CRM; botón "Probar conexión" que espera un envío de prueba.
6. Tus leads: importar CSV/XLSX (hasta 500 filas por archivo).
7. Correos obligatorios: escribir la versión de cada idioma de las secuencias
   por etiqueta (el CRM ya muestra los huecos).
8. Dominio propio (Growth y Partner pagados): ver 8C.

## 8C — Dominio de envío autoservicio

- [ ] Mover el flujo del Centro de control (`addTenantDomain`,
      `refreshTenantDomain`, `setTenantSender`) a una versión para el owner en
      Configuración → Email, con las mismas acciones de servidor y permisos de
      owner. El `super_admin` conserva su vista.
- [ ] Guardas: sólo plan pagado con `customSendingDomain`, nunca en prueba;
      comprobar slots libres del plan de Resend (`provider_settings`, fase 2)
      y avisar a ITMANO si quedan menos de 2.
- [ ] Instrucciones de DNS por proveedor (GoDaddy, Namecheap, Cloudflare,
      Google) con los registros copiables y verificación automática periódica
      (cron) hasta 72 h; correo al owner cuando quede verificado.
- [ ] Al verificar, fijar el remitente por defecto automáticamente.

## 8D — Facturación autoservicio

- [ ] Configuración → Suscripción: plan, uso, cambiar de plan, portal de
      Paddle y cancelar (fase 5). Sin "contacta a ventas" salvo Partner a
      medida.

## 8E — Ayuda en contexto

- [ ] Centro de ayuda breve (páginas estáticas, `use cache`) enlazado desde
      cada paso con `InfoHint`: dominio, integración web, importación,
      Telegram y secuencias.
- [ ] El formulario de soporte existente (`platform_requests`) queda como
      última opción.

## 8F — Salida y datos

- [ ] Exportar los datos del tenant (leads, propiedades, correos) desde
      Configuración.
- [ ] Cancelación con encuesta corta; la retención de 12 meses ya existe en
      `billing-lifecycle`.

## Estados de carga y Cache Components

- `/registro` y el centro de ayuda son públicos: shell estático; ayuda con
  `use cache` + `cacheLife` (no dependen del tenant).
- El checklist lee la sesión: va en `<Suspense>` con skeleton propio dentro
  del dashboard. Cada paso que consulta la base muestra su estado pendiente.

## Criterio de terminado

Una persona sin contacto con ITMANO se registra, prueba, paga Growth,
verifica su dominio, conecta su web y su Telegram, importa leads y recibe un
lead real, todo en producción.

Al cerrar: actualizar `docs/agents/product.md` (el signup ya no está pospuesto)
y `docs/agents/architecture.md` (registro abierto sólo por `/registro`).
