# Fase 6 — Límites del plan en código

**Objetivo:** un solo módulo de "derechos" (entitlements) que diga qué puede
hacer un tenant según su plan y estado, consultado por cada superficie. Hoy
sólo el presupuesto de IA, el multi-login y el tope de correos grupales se
aplican.

## Decisiones previas

- **D4** — Leads: límite blando (aviso al 80%, bloqueo de altas manuales e
  importaciones al 110%; el intake de formularios **nunca** se bloquea, porque
  perder un lead del cliente es peor que pasarse del límite).
- **D5** — Fin de la prueba: degradar automáticamente al día 15 si no hay pago.
- Regla de Growth: "3 agentes rastreados" con 1 login. Hoy agregar agentes
  exige Partner. Decidir: Growth puede crear hasta 3 agentes **sin login**
  (sólo para routing y métricas), o se corrige la promesa en `plans.ts`.

## Diseño

- `src/lib/subscriptions/entitlements.ts`, puro (como `access.ts`): recibe plan,
  estado, `billingExempt` y uso actual, y devuelve booleanos y topes. Combina
  `PLANS[plan].features`/`limits` con `getTenantAccess`.
- `entitlements-server.ts` con `cache()` para leer el uso por request.
- Cada acción sensible pregunta al módulo **en servidor** (la UI sólo oculta
  o explica; no es la protección).

## Tareas (cada una con su test unitario y, si toca datos, RLS)

- [ ] Propiedades publicadas a la web: Esencial 0, Growth 50, Partner ∞.
      Publicar más devuelve un error claro con el CTA de cambiar de plan.
- [ ] "Crear propiedad con IA" (PDF): sólo Growth y Partner.
- [ ] Sincronización web de propiedades: sólo Growth y Partner.
- [ ] Analytics completo (Growth+) y de equipo (Partner): definir qué pestañas
      ve Esencial y mostrar el resto con un adelanto.
- [ ] Correos al mes: el tope del plan cuenta **todos** los envíos (secuencias,
      etiquetas, one-off, open houses y grupales). Al 100%, las
      automatizaciones se pausan con aviso y el envío humano sigue con un
      margen. Reusar `monthlyEmailAllowance`.
- [ ] Leads según D4.
- [ ] Logins y agentes según la decisión de Growth.
- [ ] Fotos por propiedad (con la fase 4).
- [ ] Degradación al vencer la prueba (D5) en `billing-lifecycle`, con
      avisos a 3 días y el día del vencimiento (correo + banner).
- [ ] A&J (`billing_exempt`) sigue con acceso completo: test explícito.
- [ ] Pantalla "Tu plan" en Configuración con el uso contra cada límite.

## Criterio de terminado

- Un tenant Esencial no puede publicar propiedades ni usar IA de propiedades,
  y lo entiende por el mensaje.
- Test de tabla: cada `(plan, estado)` contra cada derecho.
- La landing (`/planes`) y el código leen la misma fuente.
