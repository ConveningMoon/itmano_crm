# Lo que queda en tus manos

Todo lo que se podía arreglar desde el código ya está hecho y verificado (ver
`2026-09-auditoria-rendimiento-opus.md`, fases 1 a 3). Esta lista es sólo lo
que un agente no puede hacer: desplegar, tocar ajustes de panel y decidir
gastos.

Orden recomendado: 1 → 2 → 3. El 4 y el 5 son proyectos aparte.

---

## 1. Mergear y desplegar  ·  gratis  ·  5 minutos  ·  **lo más importante**

Abre el PR de `perf/auditoria-rendimiento` y mergéalo.

Con eso pasan dos cosas a la vez:

- Se despliega todo el trabajo de las tres fases.
- **La función vuelve a `sfo1`.** Hoy producción corre en `iad1`
  (Washington) con la base en `us-west-1` (California): cada consulta cruza
  Estados Unidos de costa a costa, unos 60–70 ms, y una página hace dos olas
  de consultas. Marcaste `sfo1` en el panel de Vercel pero quedó pendiente de
  un deploy; este lo aplica. La función queda pegada a la base y cada consulta
  pasa de ~65 ms a ~2 ms.

Si por lo que sea no quieres mergear todavía, el efecto de la región lo
consigues igual desde Vercel → Deployments → el último de producción → ⋯ →
**Redeploy**.

**Cómo comprobar que funcionó:** entra a `app.itmano.com`, abre las
herramientas de desarrollo (F12) en la pestaña Red, recarga `/dashboard` dos
veces y mira el TTFB de la segunda. La medición previa desde Europa, con la
función en `iad1`, fue: dashboard 944 ms, leads 2 000 ms, emails 1 676 ms,
admin 1 690 ms. Deberías ver entre un tercio y la mitad de eso.

---

## 2. Vercel: parar el doble build y limpiar el almacenamiento  ·  gratis  ·  10 minutos

**El problema:** *Functions Storage* va en **26,88 GB sobre un límite de
10 GB**. La causa es que los proyectos `itmano-crm` e `itmano-crm-sandbox`
están conectados al MISMO repositorio, así que cada push construye dos veces:
20 deployments en diez días × 2 proyectos × 7 funciones cada uno.

### 2a. Que cada proyecto construya sólo lo suyo

En cada proyecto: **Settings → Git → Ignored Build Step → Custom**, y pega el
comando correspondiente:

- Proyecto `itmano-crm` (sólo debe construir producción):

  ```bash
  [ "$VERCEL_GIT_COMMIT_REF" != "main" ] && exit 0 || exit 1
  ```

- Proyecto `itmano-crm-sandbox` (sólo las ramas de trabajo):

  ```bash
  [ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 0 || exit 1
  ```

A partir de ahí cada push construye una vez. Sigues teniendo preview de cada
PR, en el proyecto sandbox y con datos de sandbox, que es lo que querías.

### 2b. Guardar menos historial

En cada proyecto: **Settings → Security → Deployment Retention Policy**.

| | `itmano-crm` | `itmano-crm-sandbox` |
|---|---|---|
| Preview | 1 día | 1 día |
| Canceled / Errored | 1 día | 1 día |
| Production | 7 días | 1 día |

Vercel siempre conserva los últimos 3 deployments del proyecto y los últimos 3
de producción listos, así que el rollback inmediato no se pierde. Lo borrado
se puede restaurar durante 30 días.

El borrado corre en las 48 h siguientes: comprueba después en **Usage →
Deployment Storage**. No borres deployments a mano salvo que siga por encima.

---

## 3. Planes de pago: qué comprar y qué no

### Vercel Pro — 20 $/mes — **sí, pero no por velocidad**

La razón es de cumplimiento, no de rendimiento. La política de uso justo de
Vercel dice literalmente que *"Hobby teams are restricted to non-commercial
personal use only"* y define uso comercial como cualquier despliegue que cobre
a visitantes o clientes. El CRM cobra suscripciones por Paddle, así que hoy
está fuera de los términos del plan gratuito.

Lo que Pro **no** te da: menos cold starts. El bytecode caching y el
pre-warming de Fluid Compute aplican igual en Hobby.

Lo que sí te da: quitarte el riesgo del límite de almacenamiento, retención
configurable de verdad, logs de 1 día en vez de 1 hora, y hasta 5 regiones
(que hoy no sirven de nada porque Postgres está en un solo sitio).

### Supabase Pro — 25 $/mes — **no acelera nada hoy**

La base pesa 19 MB, con 2 tenants y 162 leads, cache hit del 100 % y consultas
de 0,5 a 7 ms. Micro compute (lo que incluye Pro) no va a hacer más rápida
ninguna pantalla. Cómpralo cuando quieras backups diarios, que el proyecto no
se pause por inactividad, o soporte — no por velocidad.

**Lo que sí acelera es la región, y eso es gratis** (punto 1).

---

## 4. Mudanza a `iad1` + `us-east-1`  ·  proyecto con ventana de mantenimiento

Tus usuarios están en EE. UU. y en España. Con función y base juntas en
California, España paga ~150 ms por viaje; en Virginia pagaría ~90 ms y la
costa este de EE. UU. mejoraría también. Nadie empeora.

Implica crear un proyecto Supabase nuevo en `us-east-1` y migrar datos,
storage y variables. **El plan completo, paso a paso, con comandos, riesgos y
vuelta atrás, está en `2026-09-auditoria-rendimiento-opus.md`**, sección "Plan
de mudanza". Estimación de ventana: 60–90 minutos.

Hazlo después del punto 1, no antes: conviene medir primero cuánto mejora
sólo con alinear la región actual.

---

## 5. Decisiones que necesitan tu visto bueno (ninguna es urgente)

| Qué | Cuesta | Gana |
|---|---|---|
| **Cache Components (PPR)** | 2–4 días de trabajo | El shell y el esqueleto saldrían de la CDN (~135 ms desde España en vez de ~1 s). Es la mayor palanca que queda para España. El spike está hecho: 22 archivos con configuración de ruta que migrar y el layout, que lee cookies arriba del todo, hay que reestructurar. |
| **Meter `tenant_id` y `role` en el JWT** | ~1 día + revisión de auth | Quita la primera consulta de cada página. Con la base al lado vale ~10 ms; con la base lejos valía ~65 ms. Por eso conviene decidirlo DESPUÉS de la región. Hay que diseñar la revocación (hoy el rol se revalida en cada request). |
| **Speed Insights o Web Analytics de Vercel** | Incluido en Pro | TTFB y LCP reales por país, que es lo único que dice de verdad cómo se ve el CRM desde España. |

---

## 6. Dos cosas menores

- **Rota `DEV_LOGIN_SECRET`** en el `.env.development.local` de las dos
  computadoras. `next dev` escribe la URL del dev-login con el secreto en su
  propio log, y ese log se leyó durante estas sesiones. Sólo sirve en
  `localhost` contra sandbox, así que el riesgo es bajo, pero rotarlo es
  gratis.
- **Leaked password protection** en Supabase → Authentication → Policies. Con
  Magic Link no cambia nada hoy, pero activarlo tampoco cuesta.
