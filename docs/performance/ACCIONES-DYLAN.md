# Lo que queda en tus manos

Actualizado el 2026-10-03, con Vercel Pro ya contratado. Lo que se podía arreglar
desde el código está hecho y verificado (ver
`2026-09-auditoria-rendimiento-opus.md`, fases 1 a 4). Esta lista es sólo lo
que un agente no puede hacer: tocar paneles, decidir gastos y manejar secretos.

## Estado confirmado

- El PR de rendimiento está mergeado y desplegado.
- **La función de producción corre en `sfo1`** (verificado en el último deploy de
  producción), al lado de la base en `us-west-1`. El cruce de costa a costa
  ya no existe.
- La cuenta de Vercel es Pro. El CRM queda dentro de los términos de uso
  comercial.

---

## 1. Recuperar el `.env.local`  ·  15–30 minutos

### Lo que NO funciona: sacarlo de Vercel

Las 17 variables del proyecto `itmano-crm` y las 15 de `itmano-crm-sandbox`
están guardadas como **Sensitive**. Vercel no vuelve a mostrar un valor
Sensitive a nadie: ni en el panel, ni por API, ni con `vercel env pull`, que
las escribe vacías. Tampoco existen en el entorno Development, que es el que
`vercel env pull` descarga por defecto. **No hay forma de recuperar esos
valores desde Vercel.**

Y aunque se pudiera, las de `itmano-crm` son las de **producción**: el
contrato del repo prohíbe tenerlas en el clon de desarrollo.

No intentes sacarlas con una ruta temporal que las imprima: es exactamente
cómo se filtran secretos.

### Lo que tienes hoy

`.env.local` y `.env.development.local` son idénticos y apuntan al
**sandbox**, que es lo correcto. Tienen las seis variables que el día a día
necesita: las tres de Supabase sandbox, las dos del dev-login y
`RESEND_API_KEY`. `npm run dev`, `npm run build` y el login local funcionan
con eso.

Lo demás no se "perdió": el diseño del repo es que las llaves reales (IA,
Telegram, Paddle) no estén en local salvo cuando hacen falta.

### Cómo completarlo, variable por variable

Añádelas a `.env.development.local` (y a `.env.local` si quieres que `next
build` también las vea). Sólo las que vayas a usar.

| Variable | De dónde sale | ¿Hace falta en local? |
|---|---|---|
| `SUPABASE_JWT_SECRET` | Supabase → proyecto **sandbox** → Settings → JWT Keys → Legacy JWT secret | Sí, para `npm run test:rls` |
| `CRON_SECRET`, `UNSUBSCRIBE_SECRET`, `STUDIO_RENDER_SECRET`, `NOTIFICATIONS_WEBHOOK_SECRET`, `CONTACT_WEBHOOK_SECRET` | Inventados. Genera uno nuevo para cada uno con `openssl rand -hex 32` | Sólo si pruebas esa ruta. No tienen que coincidir con producción |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Opcional |
| `CHROME_EXECUTABLE_PATH` | La ruta de tu Chrome, p. ej. `C:\Program Files\Google\Chrome\Application\chrome.exe` | Sólo para el Estudio |
| `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` | Crea una llave NUEVA en console.anthropic.com / aistudio.google.com | Sólo para probar IA, y además con `ALLOW_LOCAL_AI_SPEND=1`. Cobran de verdad |
| `TELEGRAM_BOT_TOKEN` | @BotFather → /mybots → API Token | Casi nunca: publica en chats reales |
| `RESEND_API_KEY_ITMANO`, `RESEND_INBOUND_*` | Resend → API Keys → crear una nueva | Sólo para probar envíos |
| `PADDLE_*` | Paddle **sandbox** → Developer Tools → Authentication | Sólo para probar facturación |
| `DEV_LOGIN_SECRET` | Ya lo tienes. **Cámbialo** por uno nuevo (`openssl rand -hex 32`): el anterior quedó en logs que se leyeron en sesiones de agente | Sí |

Dos reglas al regenerar llaves de proveedores:

- **Crear una llave nueva no rompe producción.** Producción sigue usando la
  suya, guardada en Vercel. No revoques la vieja salvo que también la cambies
  en Vercel.
- Guarda desde ahora cada secreto en un gestor de contraseñas (1Password,
  Bitwarden…). Una variable Sensitive de Vercel es de sólo escritura: si no la
  tienes en otro sitio, la pierdes.

---

## 2. Ajustes de Vercel que aprovechan Pro

### 2a. Que `itmano-crm` construya sólo `main`  ·  ✅ aplicado el 2026-10-03

Ignored Build Step del proyecto:
`if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi`.
Comprobado: el push de `chore/vercel-pro` quedó cancelado en `itmano-crm` y se
construyó sólo en `itmano-crm-sandbox`.

Hoy cada push a cualquier rama genera un preview en `itmano-crm`, y esos
previews usan las variables de **producción**: base de datos real, llaves
reales. Con este ajuste las ramas sólo se construyen en `itmano-crm-sandbox`,
contra el sandbox. También corta a la mitad el almacenamiento de deployments.

**Corrección a la versión anterior de esta lista:** `itmano-crm-sandbox`
**debe seguir construyendo `main`**. Su dominio de producción,
`itmano-crm-sandbox.vercel.app`, es la URL base de la API de agentes en
sandbox (`docs/agent-api/README.md`). Si ignorara `main`, esa URL quedaría
congelada.

### 2b. Function CPU en Performance  ·  ✅ aplicado el 2026-10-03

Vale desde el próximo deploy de producción. Para comprobar el efecto, compara
en Observability la duración por ruta antes y después del merge.

Pro permite subir las funciones de 1 vCPU / 2 GB a **2 vCPU / 4 GB**. Vercel
la recomienda para aplicaciones con SSR y sensibles a la latencia, que es
justo el CRM: cada página se renderiza en el servidor.

Al volumen actual (unos cientos de páginas al día) el coste extra son
céntimos al mes y queda dentro del crédito de uso que incluye Pro.

### 2c. Versiones nuevas: aviso + Skew Protection 7 días + corte  ·  falta un ajuste tuyo

Decidido el 2026-10-03 (opciones A + B + D):

- **A y B, en código** (rama `chore/vercel-pro`). Cuando sale un deploy, quien
  tiene el CRM abierto ve abajo "Hay una versión nueva del CRM · Actualizar".
  Si lo ignora o lo cierra, su siguiente clic en el menú o en una tarjeta
  carga la página completa y entra la versión nueva sin perder nada escrito.
  La pestaña pregunta cada 5 minutos y al volver a ella; en segundo plano no
  pregunta.
- **Skew Protection a 7 días: hazlo tú en el panel.** La API de Vercel rechaza
  el cambio ("Skew Protection not found") aunque los builds ya la usan.
  `itmano-crm` → Settings → Advanced → Skew Protection → Maximum Age =
  **7 days**. Requiere retención de producción ≥ 7 días (punto 2e).
- **D, el corte para cambios críticos, sin código.** Tras desplegar un cambio
  que nadie debe seguir usando en su versión vieja: Deployments → el deploy
  nuevo → ⋯ → **Skew Protection Threshold** → Set. Las versiones anteriores
  dejan de responder y las pestañas abiertas pasan a la nueva en su siguiente
  acción. Úsalo sólo cuando haga falta: quien esté escribiendo algo en ese
  momento puede perderlo.

### 2d. Proteger los previews del sandbox  ·  descartado

Dylan lo descartó: el sandbox no tiene datos personales. Queda la
explicación por si se reconsidera.

Hoy cualquier preview de `itmano-crm-sandbox` es público. Con protección sólo
en Preview, para verlos hace falta estar logueado en Vercel. El dominio de
producción del sandbox sigue público, que es lo que necesita la API de agentes.

### 2e. Retención de deployments  ·  sólo desde el panel

En cada proyecto: **Settings → Security → Deployment Retention Policy**.

| | `itmano-crm` | `itmano-crm-sandbox` |
|---|---|---|
| Preview | 1 día | 7 días |
| Canceled / Errored | 1 día | 1 día |
| Production | **7 días** | 7 días |

Producción a 7 días y no menos: Skew Protection no puede llegar más atrás que
la retención. Vercel conserva siempre los últimos deployments listos, así que
el rollback inmediato no se pierde.

### 2f. Spend Management  ·  sólo desde el panel, **importante**

**Team Settings → Billing → Spend Management.** Pro factura el uso por encima
del crédito incluido. Pon un tope (por ejemplo 50 $) **sólo con
notificaciones**, sin pausar proyectos: pausar producción tumbaría el CRM a
tus clientes.

### 2g. Mirar los tiempos reales  ·  Speed Insights listo en código, actívalo tú

- **Observability → Vercel Functions** (incluido): duración de cada página en
  el servidor, por ruta.
- **Speed Insights** (rama `perf/speed-insights`): mide en el navegador de
  cada usuario real cuánto tarda en ver la página (TTFB, LCP, INP, CLS),
  agrupado por ruta (`/leads/[id]`, no un lead por fila). Sólo se monta en
  producción y sólo en el CRM.
  - No usa el paquete `@vercel/speed-insights`: no se instala sin forzar
    dependencias, y forzarlo rompe el `npm ci` de Vercel (probado). El
    componente propio hace lo mismo que el paquete: cargar el script que
    Vercel sirve en el dominio y pasarle la ruta.
  - Ya está activado en el panel de `itmano-crm` (no hay botón "Enable": el
    panel muestra "No data available" hasta que llega el primer evento).
    **Tú:** mergea el PR; los datos aparecen tras las primeras visitas.
  - **Plan gratis:** sólo la puntuación global por ruta, 10 000 eventos cada
    30 días compartidos por el equipo; si se pasa, pausa la recogida, no
    cobra.
  - **Speed Insights Plus (10 $/mes + 0,65 $ por 10 000 eventos):** TTFB y LCP
    **por país**, que es lo que dice si España mejora. Recomendado mientras
    duren Cache Components y la mudanza; se puede quitar después.

---

## 3. Supabase gratis: haz backups tú  ·  10 minutos al mes

El plan gratuito **no incluye backups descargables**. La propia documentación
de Supabase recomienda que los proyectos gratuitos exporten su base con
regularidad. Con datos de clientes, es lo que más importa de esta lista
después del punto 1.

1. Instala Docker Desktop (el `db dump` de la CLI de Supabase lo usa por
   debajo).
2. Supabase → proyecto de **producción** → Connect → copia la cadena de
   conexión *Session pooler*.
3. Desde una carpeta FUERA del repo:

   ```bash
   supabase db dump --db-url "<cadena>" -f esquema.sql
   ```

   ```bash
   supabase db dump --db-url "<cadena>" --data-only -f datos.sql
   ```

4. Guarda los dos archivos fuera del ordenador (un disco o una nube privada).

Las fotos de Storage no van en ese volcado. Hoy son unos 434 archivos y se
pueden volver a subir; si crecen, conviene copiarlas también.

Cuando el negocio lo permita, **Supabase Pro (25 $/mes) es la siguiente
compra**: siete días de backups automáticos. No por velocidad: la base pesa
19 MB y responde en milisegundos.

---

## 4. Hallazgo: Paddle no está configurado en producción

El proyecto `itmano-crm` no tiene ninguna variable `PADDLE_*`; el sandbox sí.
El botón de pago de Configuración (`startCheckout` → `src/lib/paddle/checkout.ts`)
necesita el price ID y `PADDLE_API_KEY`, y `getPaddle()` lanza si falta la
llave. Si algún cliente intenta pagar desde el CRM hoy, verá un error. Si cobras por otra vía, no pasa nada; si quieres activar el cobro
in-app, faltan las ocho variables de Paddle **Live** en Vercel.

---

## 5. Rendimiento que queda

### 5a. Cache Components (PPR)  ·  aprobado, en sesión aparte

Prompt listo para pegar en una sesión nueva:
`docs/performance/2026-10-prompt-cache-components.md`. 2–4 días de trabajo,
por etapas, con preview en el sandbox antes de mergear.

### 5b. Mudanza a `iad1` + `us-east-1`  ·  cuando decidas el día

Ganancia: el tenant piloto (Virginia) ~60 ms menos por página; España ~150 →
~90 ms por viaje. El procedimiento técnico completo está en el informe
("Plan de mudanza"). Producción hoy: Postgres 17.6, 21 MB, 478 archivos en
Storage.

**Lo que tienes que preparar tú (una vez):**

1. **Herramientas:** instala Docker Desktop. La CLI de Supabase lo usa para
   volcar la base con la misma versión de Postgres (17).
2. **El límite de 2 proyectos.** Supabase gratis permite 2 proyectos activos
   y ya tienes sandbox y producción. Dos salidas:
   - **Pausar el sandbox durante la mudanza** (gratis). Mientras esté pausado
     no hay desarrollo ni suites remotas.
   - **Contratar Supabase Pro ese mes** (25 $), que además trae backups
     diarios. Es la opción cómoda.
3. **Crear el proyecto nuevo** en `us-east-1`, con la misma organización.
4. **Darme acceso:** cambia en `.mcp.json` el `project_ref` de
   `supabase_production` por el nuevo (te digo la línea exacta) y autoriza con
   `/mcp` desde una terminal `claude`.
5. **Cadenas de conexión** (viejo y nuevo, "Session pooler") en un archivo
   `.env.migration.local` en la raíz del repo. Git lo ignora y mis scripts lo
   leen sin mostrar su contenido.
6. **Elegir la ventana:** 60–90 minutos con poco uso, y avisar a tus clientes
   de que no usen el CRM en ese rato. Los webhooks de Paddle y Resend
   reintentan solos; los leads que entren por formularios públicos durante el
   corte se recuperan con un volcado incremental justo antes del cambio (está
   en el plan).

**Lo que hago yo:** ensayo completo restaurando el sandbox en el proyecto
nuevo con suites de esquema, RLS y scoring; el día de la ventana, el volcado y
la restauración de producción, la copia de Storage, la reescritura de URLs de
imágenes, el cambio de variables en Vercel y de la región a `iad1`, y las
pruebas (login, páginas, subida de foto, suites, advisors y tabla de TTFB). El
proyecto viejo queda pausado 30 días como vuelta atrás: volver es restaurar
variables y región, y redeploy.

**Efecto para tus usuarios:** todos tendrán que volver a entrar con Magic
Link una vez (el proyecto nuevo firma las sesiones con otra clave).

### 5c. `tenant_id` y `role` en el JWT  ·  baja prioridad

Quita la primera consulta de cada página: ~5–10 ms con la base al lado. Sólo
vale la pena si la función y la base vuelven a separarse.

### 5d. Medir  ·  15 minutos, cuando quieras

Entra en `app.itmano.com` en el navegador de una sesión de Claude Code con tu
Magic Link y pide repetir la tabla de TTFB del informe. Así se compara cada
paso (hoy, después de PPR, después de la mudanza) con el mismo método.

---

## 6. Dos cosas menores

- **Leaked password protection** en Supabase → Authentication → Policies. Con
  Magic Link no cambia nada hoy, pero activarlo tampoco cuesta.
- **Crons:** `sequence-orchestrator` y `billing-lifecycle` los llama
  cron-job.org. Con Pro podrían pasar a Vercel Cron, pero eso también los
  activaría en el proyecto sandbox, que tiene llaves reales de IA y Telegram.
  Mientras cron-job.org funcione, no hay motivo para moverlos.
