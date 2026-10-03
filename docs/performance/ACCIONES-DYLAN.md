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

### 2a. Que `itmano-crm` construya sólo `main`  ·  lo puedo aplicar yo

Hoy cada push a cualquier rama genera un preview en `itmano-crm`, y esos
previews usan las variables de **producción**: base de datos real, llaves
reales. Con este ajuste las ramas sólo se construyen en `itmano-crm-sandbox`,
contra el sandbox. También corta a la mitad el almacenamiento de deployments.

**Corrección a la versión anterior de esta lista:** `itmano-crm-sandbox`
**debe seguir construyendo `main`**. Su dominio de producción,
`itmano-crm-sandbox.vercel.app`, es la URL base de la API de agentes en
sandbox (`docs/agent-api/README.md`). Si ignorara `main`, esa URL quedaría
congelada.

### 2b. Function CPU en Performance  ·  lo puedo aplicar yo

Pro permite subir las funciones de 1 vCPU / 2 GB a **2 vCPU / 4 GB**. Vercel
la recomienda para aplicaciones con SSR y sensibles a la latencia, que es
justo el CRM: cada página se renderiza en el servidor.

Al volumen actual (unos cientos de páginas al día) el coste extra son
céntimos al mes y queda dentro del crédito de uso que incluye Pro.

### 2c. Skew Protection  ·  ya activo, ajustar la ventana

Es una función exclusiva de Pro y ya está encendida por defecto en el
proyecto. Evita el error de "Server Action not found" que veía quien tenía el
CRM abierto mientras salía un deploy. Su ventana por defecto es 1 día;
conviene **7 días**, porque el CRM se deja abierto en una pestaña. Lo puedo
aplicar yo junto con 2a y 2b.

### 2d. Proteger los previews del sandbox  ·  lo puedo aplicar yo

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

### 2g. Mirar los tiempos reales  ·  gratis

**Observability → Vercel Functions**, filtrando por ruta, da la duración real
de cada página en producción. Es la forma de comprobar el efecto de la región
y de 2b sin instalar nada.

Speed Insights no se instaló: la librería oficial choca hoy con las
dependencias de Vitest y forzar la instalación arriesga el build en Vercel. Su
plan gratuito sólo da una puntuación global; los tiempos por país están en
Speed Insights Plus (10 $/mes por proyecto). No hace falta mientras
Observability baste.

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

## 5. Rendimiento que queda (ninguna es urgente)

| Qué | Cuesta | Gana |
|---|---|---|
| **Cache Components (PPR)** | 2–4 días de trabajo | El shell saldría de la CDN (~135 ms desde España en vez de ~1 s). La mayor palanca que queda para España. |
| **Mudanza a `iad1` + `us-east-1`** | Ventana de 60–90 min | España ~150 → ~90 ms por viaje, y el tenant piloto (Virginia) mejora. Plan completo en el informe. |
| **`tenant_id` y `role` en el JWT** | ~1 día + revisión de auth | Quita la primera consulta de cada página (~10 ms con la base al lado). |

---

## 6. Dos cosas menores

- **Leaked password protection** en Supabase → Authentication → Policies. Con
  Magic Link no cambia nada hoy, pero activarlo tampoco cuesta.
- **Crons:** `sequence-orchestrator` y `billing-lifecycle` los llama
  cron-job.org. Con Pro podrían pasar a Vercel Cron, pero eso también los
  activaría en el proyecto sandbox, que tiene llaves reales de IA y Telegram.
  Mientras cron-job.org funcione, no hay motivo para moverlos.
