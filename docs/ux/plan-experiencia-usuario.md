# Plan de experiencia de usuario — ITMANO CRM

Auditoría del 17 nov 2026, hecha navegando el sistema real (`app.itmano.com`)
como super_admin y verificando cada hallazgo en el código o en la base de datos.
Este documento es la fuente del trabajo: cada ítem tiene un ID, archivos,
criterio de aceptación y verificación, para que cualquier agente pueda
ejecutarlo por tandas.

## Alcance y método

- **Entorno:** producción. Escrituras sólo en **Tenant Test**; **A&J** sólo
  lectura. No hubo llamadas a IA pagada ni envíos de correo.
- **Recorrido:** Centro de control (4 pestañas), Dashboard (5 pestañas), Leads
  (lista, filtros, orden, Kanban, detalle, editar, enviar correo, alta,
  borrado), Propiedades (lista, detalle, formulario, Crear con IA, página
  pública), Newsletters (lista, editor, nueva, página pública), Fuentes (lista,
  detalle, constructor), Emails (4 pestañas, detalle de secuencia), Estudio,
  Configuración (8 pestañas), Soporte, Solicitudes, Actividad, Notificaciones,
  selector de tenant y vista móvil (375 px). Escritorio probado a 968 px.
- **Base de datos (sólo lectura, MCP `supabase_production`):** bandas de
  calidad, distribución de etapas, definición de funciones y advisors de
  seguridad.
- **Acciones con efecto durante la auditoría:** se creó y se borró el lead de
  prueba "QA Duplicado" en Tenant Test (eso generó una notificación "Lead
  eliminado"). En Estudio se hizo una previsualización sin IA (no se guardó).

### Qué no cubrió esta tanda (pendiente para la tanda 2)

Open houses y RSVP, importación CSV/XLSX, "Integración" de newsletters,
"Métricas" de Fuentes y Emails, carpetas, Estudio → "Mi imagen" y plantillas,
editar tenant en el Centro de control, login sin sesión, y sobre todo **la
vista de los roles `agent_owner` y `agent`** (hace falta un usuario de prueba de
cada rol en Tenant Test). Tampoco se revisaron los correos ya renderizados en un
cliente de correo.

## Estado de ejecución

**Tanda 1 — rama `fix/ux-tanda-1` (17 nov 2026).** Dylan delegó las decisiones;
las tomadas están marcadas con *Decisión*.

| Ítem | Estado |
|---|---|
| UX-001 | Hecho: `GET` en el cron + aviso en el Centro de control (>36 h). *Decisión:* no se recalculó a mano en producción (habría modificado scores de A&J); el cron lo hará tras el deploy. |
| UX-002 | Hecho en intake y RSVP (`public_rate_limit`, migración `20261117150000`). Contacto no: exige secreto compartido y lo llama el servidor del sitio, así que limitar por IP lo bloquearía entero. |
| UX-003 | Hecho: idioma por defecto, validación compartida cliente/servidor, errores por campo con foco, sin errores crudos de Postgres. |
| UX-004 | Hecho: aviso de duplicado con "Abrir lead existente" o "Registrar igualmente", y correos grupales y de open house deduplicados por email (`duplicate_email`). |
| UX-005 | Hecho: `checkoutPlans()`. *Decisión:* con suscripción activa o pago vencido nunca se ofrece checkout de otro plan; mejorar va por "Cambiar de plan". |
| UX-006 | Hecho. *Decisión:* acciones del agente permitidas en En proceso (`MANUAL_ACTION_STAGES`), con `disabled` real en Cerrado y Perdido. |
| UX-007 | Hecho (alcance reducido): aviso "Modelo global" y doble confirmación que nombra a todos los tenants. Mover la edición al Centro de control queda para otra tanda. |
| SEC-1 | Hecho: `X-Frame-Options`/`frame-ancestors 'self'` en el CRM (no en subdominios alojados, que se incrustan a propósito), `nosniff`, `Referrer-Policy`, sin `x-powered-by`. |
| UX-012 | Hecho de paso: el éxito sólo menciona la secuencia si el lead entró en una, y ofrece "Ver lead". |

Nota sobre UX-039: los montos en dólares de "Uso de IA" ya se ocultan a los
usuarios del tenant (`maskAiCosts`); lo visto en la auditoría era la vista de
super_admin. El ítem se reduce a nombres de modelos y tokens.

## Convenciones

- **Prioridad:** P0 = rompe confianza, dinero o seguridad; P1 = bug funcional o
  fricción fuerte; P2 = consistencia, copy, a11y; P3 = idea de producto.
- **Tipo:** Bug · UX · Copy · A11y · Seguridad · Datos · Idea.
- **Esfuerzo:** S (< 1 h), M (medio día), L (1 día o más).
- Las ideas P3 son roadmap: **no se empiezan sin aprobación explícita de Dylan**
  (regla de `AGENTS.md`).
- Todo cambio que toque consultas entrega su estado de carga en el mismo commit
  (skeleton, `<Suspense>`, `useTransition`) y declara si aplica Cache Components.
- Verificación base de cada tanda: `npm run lint`, `npx tsc --noEmit`,
  `npm run test:unit`, `npm run build`, y comprobación en el navegador.
  Migraciones: sandbox primero, después advisors, después producción.

## Resumen ejecutivo

1. **El cron diario de scoring no corre desde hace casi 3 meses.** Las bandas de
   calidad de A&J se calcularon por última vez el 25 ago 2026 con 3 leads
   activos; hoy tiene 52. Por eso su dashboard dice "Calidad alta 0" y el
   producto parece no clasificar nada (UX-001).
2. **Los endpoints públicos que crean leads no tienen rate limiting.** Se pueden
   usar para generar spam, notificaciones y gasto de IA real (UX-002).
3. **Registrar un lead sin elegir idioma muestra un error crudo de Postgres** y
   en un lugar donde el usuario no lo ve (UX-003).
4. **El alta manual acepta emails duplicados y teléfonos inválidos** (UX-004,
   UX-013).
5. **Un tenant con plan Esencial activo ve "Pagar ahora" para Growth.** Puede
   crear una segunda suscripción en Paddle (UX-005).
6. **Las acciones del agente (visita, propuesta, cita) están bloqueadas en
   leads "En proceso"**, que es justo cuando ocurren (UX-006).
7. **Varios formularios muestran placeholders con la identidad de A&J** a otros
   tenants. Eso rompe el white-label (UX-030).
8. **"Crear con IA" en Propiedades guarda datos contradictorios**: año 1754
   frente a "Built in 1913", 1,488 frente a 2,126 sqft (UX-019).
9. **La mayoría de páginas no tiene título propio**, ni en el topbar ni en la
   pestaña del navegador (UX-010).
10. **El CRM se puede embeber en un iframe de terceros**: no hay CSP
    `frame-ancestors` ni `X-Frame-Options` (SEC-1).

---

## Tanda 1 — P0: confianza en los datos, dinero y seguridad

### UX-001 · Cron `score-decay` responde 405: bandas y decay congelados
- **Tipo:** Bug / Datos · **Esfuerzo:** S (código) + verificación.
- **Evidencia:** `vercel.json` programa `GET /api/cron/score-decay`, pero
  `src/app/api/cron/score-decay/route.ts` sólo exporta `POST`. Hoy
  `curl https://app.itmano.com/api/cron/score-decay` devuelve 405. En
  producción, `tenant_quality_bands` tiene `computed_at = 2026-08-25` para los
  dos tenants (`active_leads = 3` en A&J, frente a 52 leads `nuevo` hoy). La
  auditoría de rendimiento de septiembre ya lo había detectado sin cerrarlo.
- **Impacto:** A&J ve 0 leads de calidad Alta o Media alta, el Top 5 y la
  prioridad pierden sentido y el decay de actividad no se aplica.
- **Cambio:** exportar `GET` con la misma comprobación `Bearer CRON_SECRET`
  (Vercel Cron la envía) y conservar `POST` por si algún programador externo lo
  usa. Agregar una alerta en el Centro de control si `computed_at` tiene más de
  36 h.
- **Remediación inmediata (necesita OK de Dylan):** ejecutar una vez
  `refresh_quality_bands()` y `decay_lead_scores(false)` en producción, o lanzar
  el cron a mano con el secreto.
- **Aceptación:** GET con secreto → 200; sin secreto → 401. Al día siguiente
  del deploy, `computed_at` es de las últimas 24 h y A&J muestra bandas
  repartidas.
- **Verificar también:** que "Para hoy = 0" en A&J (52 leads nuevos) se corrige
  con el decay. Si no se corrige, abrir un ítem aparte sobre `getUrgentTodayCount`.

### UX-002 · Intake y contacto públicos sin rate limiting
- **Tipo:** Seguridad · **Esfuerzo:** M.
- **Evidencia:** `src/app/api/intake/[publicId]/submit/route.ts:133` tiene un
  `TODO: rate limiting`. `src/app/api/contact/[publicId]/submit/route.ts` no
  tiene rate limit ni honeypot. El intake llama a `assessLeadFit`, que cuesta
  dinero real cuando el tenant tiene IA activa, y dispara notificaciones
  (Telegram y email) y secuencias.
- **Cambio:** límite por IP y `publicId` reutilizando el patrón de
  `agent_api_rate_limit` (`src/lib/agent-api/rate-limit.ts`, migración 103), o
  una tabla equivalente. Agregar honeypot en el formulario de contacto. Con
  menos prioridad, evaluar Cloudflare Turnstile en las páginas alojadas.
- **Aceptación:** más de N envíos por minuto desde una IP → 429, sin crear lead
  ni evento. Test unitario del limitador y prueba manual contra sandbox.

### UX-003 · Alta de lead sin idioma → error crudo de Postgres
- **Tipo:** Bug · **Esfuerzo:** S.
- **Evidencia (reproducido en Tenant Test):** con "Idioma preferido" sin elegir,
  aparece bajo **Nombre** el texto
  `new row for relation "leads" violates check constraint "leads_language_check"`.
  El botón queda abajo, así que el usuario hace clic y no ve nada.
  `isSubmitDisabled` (`src/app/(dashboard)/leads/new/new-lead-client.tsx:423`)
  no exige idioma, y `createLead` (`leads/new/actions.ts`) inserta sin validar.
- **Cambio:** preseleccionar el idioma por defecto (`es` o el del tenant) y
  validar con Zod en el servidor. Traducir los errores de base a mensajes
  humanos y mostrar el error general junto al botón, con scroll y foco al primer
  campo inválido.
- **Aceptación:** ningún error de Postgres llega a la UI. Test unitario de
  `createLead` con input inválido.

### UX-004 · Emails duplicados en el alta manual
- **Tipo:** Bug / Datos · **Esfuerzo:** S–M.
- **Evidencia:** se creó un segundo lead con un email ya existente sin ningún
  aviso. `getExistingLeadEmails` existe pero sólo lo usa la importación. Con
  duplicados, "Correo grupal a este filtro (2)" enviaría dos veces a la misma
  persona.
- **Cambio:** antes de insertar, detectar el duplicado y ofrecer "Abrir lead
  existente" o "Crear igualmente". Deduplicar destinatarios por email en los
  broadcasts. Más adelante (P3), fusionar leads.
- **Aceptación:** test de `createLead` con email repetido y test de
  deduplicación de destinatarios.

### UX-005 · Plan Esencial activo con botón "Pagar ahora" de Growth
- **Tipo:** Bug / Dinero · **Esfuerzo:** M · **Decisión de Dylan.**
- **Evidencia:** Configuración → Cuenta (Tenant Test, Esencial, activa) muestra
  "Paga tu inversión · Growth $129 · Pagar ahora".
  `src/app/(dashboard)/settings/subscription-card.tsx:157` sólo oculta el plan
  actual. Si Esencial está pagado en Paddle, comprar Growth abre una segunda
  suscripción, el mismo riesgo que el comentario del archivo describe para el
  plan actual.
- **Cambio:** con suscripción activa en Paddle, la mejora de plan debe pasar por
  "Cambiar de plan" (actualización de la suscripción o solicitud a ITMANO) y no
  por un checkout nuevo. Copy: "Mejorar a Growth".
- **Aceptación:** con `status = active` y Paddle activo no se ofrece ningún
  checkout. Tests del helper `canBuy`.

### UX-006 · Acciones del agente bloqueadas en leads "En proceso"
- **Tipo:** Bug de producto / A11y · **Esfuerzo:** S · **Decisión de Dylan.**
- **Evidencia:** `ACTIVE_STAGES = ['nuevo','nutricion']`
  (`src/lib/scoring/priority.ts:34`) desactiva "Visita atendida", "Propuesta
  enviada" y "Cita agendada" en `en_proceso`, que es cuando ocurren. El
  comentario de `manual-actions-panel.tsx:33` dice que la intención era bloquear
  sólo cerrados o perdidos. El banner "fuera del funnel activo" confunde en un
  lead En proceso. El bloqueo usa `pointer-events: none` (línea 83): los botones
  siguen enfocables y se activan con el teclado, y el servidor responde con un
  error.
- **Cambio:** si se confirma la intención, permitir las acciones en
  `en_proceso` (sin cambiar `ACTIVE_STAGES`, que también define la cartera
  activa: usar otro conjunto), y usar `disabled` en vez de `pointer-events`.
  Revisar `applyManualAction` (`leads/[id]/actions.ts:195`).
- **Aceptación:** en un lead En proceso se registra la visita y el score se
  actualiza. Cerrado y Perdido siguen bloqueados también con el teclado.

### UX-007 · Scoring global editable desde dentro de un tenant
- **Tipo:** UX / Riesgo operativo · **Esfuerzo:** M.
- **Evidencia:** Configuración → Scoring, dentro de Tenant Test, dice "Estos son
  los valores globales del modelo. Aplican a todos los tenants" y tiene "Guardar
  cambios". Es fácil cambiar el modelo de todos creyendo que se edita un solo
  tenant.
- **Cambio:** mover la edición global al Centro de control. Dentro del tenant,
  dejar sólo la calibración del tenant y una vista de lectura del modelo, con un
  aviso destacado si se edita lo global.

### SEC-1 · Sin protección contra clickjacking ni CSP
- **Tipo:** Seguridad · **Esfuerzo:** S–M.
- **Evidencia:** `curl -I` sobre `app.itmano.com`, `properties.` y `news.` sólo
  devuelve HSTS. No hay `Content-Security-Policy`, `X-Frame-Options`,
  `X-Content-Type-Options` ni `Referrer-Policy`, y sí aparece `x-powered-by:
  Next.js`.
- **Cambio:** `headers()` en `next.config.ts` con `frame-ancestors 'none'` para
  el CRM. En las páginas alojadas, mantener los iframes necesarios (los embeds
  de Zillow y Matterport van dentro; ser embebidas en webs de clientes requiere
  una lista explícita). Agregar `nosniff`, `Referrer-Policy` y
  `poweredByHeader: false`. Después, una CSP en modo report-only.
- **Aceptación:** los headers presentes en producción y el embebible de
  intake/propiedades sigue funcionando en la web de A&J.

---

## Tanda 2 — P1: bugs funcionales y fricción fuerte

### UX-010 · Páginas sin título (topbar y pestaña del navegador)
- **Tipo:** UX · **Esfuerzo:** S.
- **Evidencia:** `src/components/layout/topbar.tsx:7` sólo mapea 6 rutas exactas.
  Propiedades, Newsletters, Fuentes, Emails, Estudio, Soporte, Solicitudes y
  todos los detalles muestran "ITMANO CRM". `document.title` es siempre
  "ITMANO CRM" (`src/app/layout.tsx:21`; ninguna página exporta `metadata`).
- **Cambio:** derivar el título del topbar de `nav-items.ts` por prefijo de ruta.
  Agregar `metadata.title` estático por página con la plantilla
  `%s · ITMANO CRM`.
- **Cache Components:** los títulos estáticos salen en el shell prerenderizado.
  No meter el nombre del lead ni del tenant en `generateMetadata`, porque
  leería la sesión fuera de `<Suspense>`.

### UX-011 · Enlaces del historial que no llevan a nada
- **Evidencia:** en el detalle del lead, "Ver formulario" y "Ver correo" del
  historial abren las pestañas Formularios (0) y Emails (0).
- **Cambio:** mostrar el enlace sólo si existe el registro vinculado (submission
  o email). Si no existe, mostrar el contenido del evento en línea.

### UX-012 · El mensaje de éxito promete una secuencia que no existe
- **Evidencia:** `new-lead-client.tsx:141` siempre dice "La secuencia de email
  se activará automáticamente". Un registro manual sin canal no se enrola.
- **Cambio:** mostrar el texto según el resultado real de `enrollLeadInSequence`
  y agregar el botón "Ver lead".

### UX-013 · Teléfono sin validación y sin acciones rápidas
- **Evidencia:** "abc" se guardó como teléfono. En móvil no hay enlaces `tel:`
  ni WhatsApp y el número se ve sin formato ("7579814551").
- **Cambio:** validar y normalizar a E.164 (con libphonenumber o una regex
  simple más país por defecto del tenant), mostrar formateado y agregar los
  botones Llamar, WhatsApp y Email en la ficha y en las filas en móvil.

### UX-014 · Kanban ignora el orden elegido
- **Evidencia:** `fetchKanbanColumns` ordena siempre por `created_at`
  (`src/lib/data/leads.ts:261`) aunque "Valor" siga resaltado.
- **Cambio:** aplicar `applySort` también por columna, u ocultar el selector de
  orden en Kanban. El drag & drop entre etapas queda como idea (P3-01).

### UX-015 · Ordenar por un dato que no se ve
- **Evidencia:** la tabla de leads no muestra score, valor ni último contacto,
  pero ofrece ordenar por "Prioridad" y "Valor".
- **Cambio:** columnas opcionales Score, Valor estimado y Último contacto
  (`leads-table-cols.ts`), visibles al menos en la columna del orden activo.

### UX-016 · Modales hechos a mano con accesibilidad desigual
- **Evidencia:** en "Enviar correo", Escape no cierra, el foco se queda detrás
  del diálogo, la X no tiene `aria-label` y falta `aria-labelledby`. No existe
  un componente `Dialog` compartido en `src/components/ui/`.
- **Cambio:** crear `src/components/ui/dialog.tsx` (con `<dialog>` nativo o
  focus trap propio): Escape, foco inicial, devolución del foco, `aria-modal` y
  `aria-labelledby`. Migrar Enviar correo, Editar lead, Filtros, Eliminar, Nueva
  propiedad y Crear con IA.

### UX-017 · Saltos de layout que provocan clics equivocados
- **Evidencia:** en Estudio, al elegir una propiedad aparecen tres avisos "Sin
  portada del agente" que empujan los botones, y el clic en "Previsualizar"
  cayó en "Guardar en la biblioteca". En el alta de lead, el error de "Origen"
  aparece y desaparece moviendo el botón.
- **Cambio:** reservar el espacio de los avisos o mostrarlos fuera del flujo
  (aviso único arriba). Mantener una altura estable en las zonas de error.

### UX-018 · Estudio: estado engañoso y vista previa lejos
- **Evidencia:** durante la previsualización, el botón "Guardar en la
  biblioteca" muestra "Guardando…". La vista previa sale debajo del formulario
  mientras el panel derecho sigue diciendo "Todavía no hay imágenes". La
  dirección es obligatoria, pero el campo no lleva asterisco y el error sale
  lejos.
- **Cambio:** estados separados para previsualizar y guardar, la vista previa en
  el panel derecho (sticky) y la validación en el campo.

### UX-019 · "Crear con IA" guarda datos contradictorios en propiedades
- **Tipo:** Datos / IA · **Esfuerzo:** M.
- **Evidencia (propiedad de Tenant Test):** año 1754 frente a "Built in 1913",
  1,488 sqft frente a 2,126 en las características, "two-story" frente a "3
  stories", y "Garaje 0" en la web frente a "2-car garage". La página pública
  publica esas contradicciones.
- **Cambio:** en el paso de revisión, comparar los campos estructurados con el
  texto generado y marcar las discrepancias antes de guardar o publicar. Pedir
  al prompt que derive el texto de los campos ya extraídos. **No ejecutar
  pruebas con IA real sin avisar a Dylan del costo (~$0.05 por uso).**

### UX-020 · Página pública de la propiedad sin captación de leads
- **Tipo:** UX / Producto · **Decisión de Dylan** (puede considerarse feature).
- **Evidencia:** `properties.itmano.com/<tenant>/<slug>` no tiene formulario ni
  CTA de "Agendar visita" o "Pedir información".
- **Cambio propuesto:** un CTA fijo que abra el formulario de intake ya existente
  ligado a la propiedad, para que el lead entre con la propiedad de interés.

### UX-021 · Recorrido virtual en blanco
- **Evidencia:** el iframe de Zillow (`view-imx`) se ve como un recuadro blanco
  de 514 px, probablemente porque Zillow bloquea el embebido.
- **Cambio:** detectar los proveedores que no permiten iframe y mostrar una
  tarjeta "Ver recorrido 3D" que abra en una pestaña nueva. Validarlo al pegar
  el embed en el formulario.

### UX-022 · Notificaciones poco accionables
- **Evidencia:** de 10 notificaciones, sólo una enlaza a su recurso. No hay
  estado leído/no leído por ítem ni paginación visible, el filtro "Contact Us"
  convive con "Contacto" y las fechas usan `dd/mm/yyyy`.
- **Cambio:** enlazar cada tipo (lead, fuente, evento), marcar como leída,
  agregar "Marcar todas" y paginar. Unificar los nombres de los tipos.
- **Cache Components:** la lista depende de la sesión. Mantenerla tras
  `<Suspense>` con `use cache: private` si se cachea.

### UX-023 · Actividad sin nombre de lead ni enlace
- **Evidencia:** `/activity` y "Actividad reciente" muestran "Lead creado ·
  Sistema · Hace 85 días" sin decir qué lead ni permitir abrirlo.
- **Cambio:** incluir el nombre del lead y el enlace, filtros por tipo y agente,
  y fecha absoluta a partir de 7 días.

### UX-024 · Editar lead incompleto o incoherente
- **Evidencia:** "Tipo de fuente" sale vacío aunque el origen sea "Registro
  manual", y ofrece "ManyChat", que no está implementado. No se pueden editar los
  datos de fit (presupuesto, plazo, financiación, zona) que mueven el score. Hay
  19 idiomas aquí y 3 en el alta.
- **Cambio:** reflejar el origen real, ocultar los tipos sin canales en el tenant
  y agregar una sección "Perfil" editable que recalcule con
  `recompute_lead_score`. Unificar la lista de idiomas.

### UX-025 · Fecha del evento como texto libre
- **Evidencia:** el constructor de páginas de evento pide "Fecha" y "Hora" en
  texto ("Sábado 12 de octubre").
- **Cambio:** date y time pickers con zona horaria del tenant. Eso permite
  ordenar, marcar eventos pasados, generar `.ics` y enviar recordatorios.

### UX-026 · Topbar no fijo
- **Evidencia:** al hacer scroll desaparecen "Registrar lead", el selector de
  tenant y la campana.
- **Cambio:** `position: sticky` en el topbar, comprobando que no tape los
  skeletons ni los drawers en móvil.

---

## Tanda 3 — P2: consistencia, copy y white-label

### UX-030 · Placeholders con identidad de A&J visibles a otros tenants
- **Tipo:** White-label (rompe una regla de `AGENTS.md`) · **Esfuerzo:** S.
- **Archivos:**
  - `src/app/(dashboard)/newsletters/nueva/new-edition-form.tsx:112` (Hampton Roads)
  - `src/app/(dashboard)/settings/agent-row.tsx:349`
  - `src/app/(dashboard)/sources/[slug]/hosted-page-editor.tsx:509, 550, 630, 871`
    ("Oficina A&J · Virginia Beach", "Asesora bilingüe · A&J"…)
  - Alta de lead: "(757) 555-0000" y "Navy Federal"; Nueva propiedad: "Virginia
    Beach"; `src/app/(dashboard)/sources/actions.ts:210`
  - `src/app/(dashboard)/admin/admin-client.tsx:137, 145` (sólo super_admin;
    cambiar igualmente)
- **Cambio:** placeholders genéricos, o derivados de los datos del tenant (zona
  principal en "Tu negocio"). Agregar un test que busque "A&J", "Hampton" y
  "Virginia" en `src/app/(dashboard)`.

### UX-031 · Formatos de número, moneda y fecha mezclados
- **Evidencia:** "$249,900" (en-US) en propiedades y "$425.000" (es) en el
  detalle del lead. Fechas en "24 ago", "16 de junio de 2026", "15/09/2026",
  "hace 21 h" y el date picker en `mm/dd/yyyy`.
- **Cambio:** un helper `formatMoney`, `formatDate` y `formatRelative` con el
  locale del tenant. El tenant piloto opera en USD (EE. UU.) con UI en español:
  decidir con Dylan entre `es-US` y `es`.

### UX-032 · Spanglish, jerga y tildes
- **Ejemplos:** "Runs activos", "Template Resend", "Contenido CRM",
  `entry/mid/premium`, "Tipo Loan", "Cash buyer", "Relocation", "Necesita
  lender", "Contact Us", "Ver Opciones de integración" (Title Case), "Fuentes de
  Adquisición", "canal" frente a "fuente". En reglas de la base: "Motivacion",
  "Desuscripcion". En eventos seed: "Descargo", "Respondio". También "runs de
  secuencia" en el modal de borrado y el espacio en "QA Duplicado ?".
- **Cambio:** glosario único en `docs/agents/product.md` y una pasada de copy.
  Las etiquetas de `lead_score_rules` y de las etiquetas por defecto necesitan
  migración (sandbox primero).

### UX-033 · Banderas para idiomas
- **Evidencia:** 🇺🇸 English, 🇪🇸 Español, 🇸🇦 العربية… Un idioma no es un país.
- **Cambio:** mostrar el nombre del idioma o un código (ES, EN, PT) sin bandera.

### UX-034 · Pestañas sin URL
- **Evidencia:** Centro de control, detalle de propiedad y Emails no reflejan la
  pestaña en la URL; al recargar o compartir se vuelve a la primera. Dashboard y
  Configuración sí lo hacen (`?tab=`).
- **Cambio:** el mismo patrón `?tab=` con `useTransition`.
- **Cache Components:** leer `searchParams` vuelve dinámico el segmento. Dejar
  sólo el contenido de la pestaña tras `<Suspense>`, no la cabecera.

### UX-035 · Pestañas que desbordan sin indicación
- **Evidencia:** a 968 px quedan ocultas "Uso de IA" y "Cuenta y acceso" en
  Configuración, "Archivados" en Fuentes y varios filtros de Notificaciones.
- **Cambio:** degradado en los bordes y scroll horizontal visible, o un menú
  "Más".

### UX-036 · KPIs con definiciones que confunden
- "Cartera activa" (Nuevo y Nutrición, con importados) frente al Embudo (sin
  importados, con suscriptores) frente al Top 5 (incluye En proceso): tres
  definiciones en una sola pantalla. Hoy sólo se explica en tooltips.
- "Calidad media 44" en Agentes es un score promedio que choca con la banda
  "Media" → renombrar a "Score promedio".
- Tasas "0%" con 0 envíos → mostrar "—".
- "no cambia con el periodo" en General, que no tiene selector de periodo.
- "Calidad alta" del dashboard frente a la del Centro de control: aclarar el
  alcance en la etiqueta ("en cartera activa").

### UX-037 · Gráfico "Evolución de leads"
- La importación de 113 leads de junio en A&J aparece como un pico de altas.
- En Tenant Test, la línea se corta en julio y los meses sin datos no se dibujan
  en 0.
- **Cambio:** separar o excluir los importados (como ya hace la conversión) y
  rellenar los meses vacíos con 0.

### UX-038 · Configuración → Tu negocio
- Selector de zona horaria con cientos de zonas IANA crudas → combobox con
  búsqueda y las zonas frecuentes arriba.
- Montos sin separador de miles en los inputs; chips con `entry/mid/premium`.

### UX-039 · Uso de IA para el cliente
- Muestra nombres de modelos y proveedores (`claude-haiku-4-5`,
  `gemini-3.1-flash-image-preview`) y tokens, pero no el límite en dólares.
- **Cambio:** en la vista del tenant, el gasto frente al límite en $ y por
  función, sin modelos ni tokens (que queden sólo en el Centro de control).
  Corregir la nota del Centro de control, que atribuye la tarifa de sonnet a
  todo aunque el fit usa haiku.

### UX-040 · Detalles internos visibles
- El ID `chn_…` en el detalle de la fuente, "Descargar/Subir JSON" en el
  constructor, el enlace "Descargar ficha" que apunta a `…supabase.co/storage…`
  y el ID de Paddle.
- **Cambio:** ocultar los IDs (o mostrarlos sólo a super_admin), mover el JSON a
  un menú "Avanzado" y servir los archivos públicos con dominio propio
  (proxy o rewrite en `properties.itmano.com/files/…`).

### UX-041 · Logo del tenant ilegible en el sidebar
- Los logos oscuros (Tenant Test y A&J) casi no se ven sobre el fondo negro.
- **Cambio:** pedir una variante clara al subir el logo, o calcular el contraste
  y poner una placa clara detrás. Previsualizar en el tema real.

### UX-042 · Imágenes sin placeholder y sin optimizar
- La portada de la newsletter descarga el original de 1920 px para una miniatura
  de 118 px. En la lista de propiedades queda un hueco negro mientras carga.
- **Cambio:** `next/image` con `sizes` y un skeleton o blur de placeholder.

### UX-043 · Super_admin dentro de un tenant ve datos de otros tenants
- Emails → "De cierre" lista los agentes de A&J estando en Tenant Test
  (intencional, `emails/page.tsx:242`, en sólo lectura), pero rompe el modelo
  mental de "estoy dentro de este tenant".
- **Cambio:** mostrar sólo el tenant activo y dejar la vista cruzada en el
  Centro de control.

### UX-044 · Formulario "Nueva propiedad"
- "🇺🇸 English" aparece duplicado al final de la lista de idiomas. Hay dos campos
  "ESTADO" (estado de venta y estado de EE. UU.). El texto del slug dice
  `/houses/<slug>` y la URL real es `properties.itmano.com/<tenant>/<slug>`.
  "ambas descripciones" cuando se permiten hasta 3 idiomas. Los placeholders
  parecen valores rellenados. Es un modal muy largo: valorar una página
  `/properties/new`.

### UX-045 · Pulido del borrado de un lead
- Sin toast de confirmación. Vuelve a `/leads` y pierde los filtros. El borrado
  es definitivo, sin papelera (la idea de papelera es P3-06).

### UX-046 · Emails y secuencias
- Una secuencia "Activa" con 0 pasos no muestra alerta en la lista.
- El botón "Activa" funciona como interruptor ambiguo → usar un switch con
  etiqueta.
- "Configúralo en Configuración → Email" no es un enlace.
- En Configuración → Email no hay CTA para pedir dominio propio o mejorar el
  plan.

### UX-047 · Alta de lead
- Email obligatorio: impide registrar leads que sólo dan teléfono (visitas o
  llamadas). Decidir con Dylan si basta email **o** teléfono.
- Con un solo agente, preseleccionarlo.
- El botón "Registrar lead" está deshabilitado sin explicar qué falta.

### UX-048 · Estudio: calidad visual del diseño "Foto completa"
- El overlay saturado con el color de marca tapa ~60 % de la foto.
- **Cambio:** degradado neutro oscuro con el color de marca sólo como acento.

### SEC-2 · Funciones `SECURITY DEFINER` expuestas (advisors)
- `recompute_lead_score(p_lead_id)` se puede ejecutar como `authenticated` con
  cualquier id. Un usuario de un tenant puede forzar el recálculo de leads de
  otro (impacto bajo, pero cruza tenants).
- `get_my_tenant_id()` e `is_super_admin()` se pueden ejecutar como `anon`
  (aviso de los advisors; impacto bajo).
- **Cambio (migración, sandbox primero):** `revoke execute … from
  authenticated` en `recompute_lead_score` (el servidor lo llama con
  service_role) y `revoke … from anon` en los otros dos, comprobando que las
  políticas RLS siguen funcionando con `authenticated`. Pasar `test:rls`.

### SEC-3 · Higiene de producción
- Datos de prueba dentro del tenant real A&J: leads "Test Lead" y "Tes Lead",
  "Test Agent", la fuente "LM Test" y el typo "Contact Ust". Contaminan métricas,
  el contexto de IA y "Fit IA". **Limpieza sólo con confirmación de Dylan**
  (borrado en producción).
- Funciones `rls_test_*` presentes en producción (no ejecutables por anon ni
  authenticated). Confirmar si deben existir allí.
- `notifications/dispatch` registra la longitud del secreto esperado en los
  logs: quitarla.

---

## Tanda 4 — Móvil y accesibilidad

- **M-01** El título del topbar se trunca ("Dash…", "ITMA…"), el pill de IA ocupa
  espacio y el selector de tenant sólo muestra un punto. → En móvil, ocultar el
  pill de IA y mostrar el nombre corto del tenant.
- **M-02** Lista de leads en móvil sin acción rápida de llamar o escribir (ver
  UX-013).
- **M-03** El sidebar de escritorio corta "Solicitudes" a 752 px de alto sin
  indicar que hay scroll.
- **A-01** Auditar el foco visible y el orden de tabulación en todo el
  dashboard, junto con UX-016.
- **A-02** El formulario de suscripción de la newsletter pública no es un
  `<form>`: Enter no envía y los lectores de pantalla no lo identifican.
- **A-03** Ejecutar axe (o Lighthouse) en las 10 rutas principales y en las
  páginas alojadas, y anotar los resultados en la tanda 2.

---

## Tanda 5 — Ideas de producto (P3, requieren aprobación)

- **P3-01 Kanban con drag & drop** entre etapas, con confirmación al pasar a
  Cerrado o Perdido.
- **P3-02 Vista "Hoy"**: cola diaria del agente (leads urgentes, citas, sin
  respuesta), apoyada en la urgencia derivada, cuando UX-001 esté corregido.
- **P3-03 Vistas guardadas y acciones en lote**: asignar agente, cambiar etapa o
  etiquetar varios leads.
- **P3-04 Búsqueda global (Cmd+K)** de leads, propiedades, fuentes y ediciones;
  búsqueda por teléfono.
- **P3-05 Deduplicar y fusionar leads** (continúa UX-004).
- **P3-06 Papelera** con restauración durante 30 días en lugar del borrado duro.
- **P3-07 Estimación de costo antes de cada acción con IA** ("≈ $0.05").
- **P3-08 Checklist de puesta en marcha del tenant** (logo legible, dominio,
  pasos de la secuencia, perfil de negocio, primera fuente). Ojo: el
  *onboarding automático* está pospuesto en `product.md`; esto sería sólo una
  checklist informativa.
- **P3-09 Captación en propiedades** (UX-020) y "propiedades de interés" en la
  ficha del lead.
- **P3-10 Recordatorios de evento** (`.ics` y email), cuando haya fecha
  estructurada (UX-025).
- **P3-11 Historial de mis solicitudes** en Soporte.
- **P3-12 Filtros extra en Leads:** rango de fechas, score, sin agente, último
  contacto y propiedad.

---

## Decisiones que necesita Dylan

1. **UX-001:** ¿ejecuto ya `refresh_quality_bands()` y `decay_lead_scores()` en
   producción para recuperar A&J, antes del fix del cron?
2. **UX-005:** ¿cómo debe hacerse la mejora de plan con Paddle activo (cambio de
   suscripción o solicitud a ITMANO)?
3. **UX-006:** ¿las acciones del agente deben valer en "En proceso"?
4. **UX-020 / P3-09:** ¿se agrega la captación en la página pública de
   propiedades?
5. **UX-031:** ¿qué locale usar (`es-US` o `es`) para números y fechas?
6. **UX-047:** ¿basta email **o** teléfono para registrar un lead?
7. **SEC-3:** ¿se limpian los datos de prueba del tenant A&J?
8. Para la tanda 2: un usuario `agent_owner` y otro `agent` en Tenant Test, para
   revisar la experiencia por rol.

## Orden de ejecución sugerido

1. Tanda 1 sin decisiones pendientes: UX-001 (código), UX-002, UX-003, UX-004 y
   SEC-1. Cada uno en su commit convencional.
2. Tanda 1 con decisiones: UX-005, UX-006 y UX-007.
3. Tanda 2 por bloques: Leads (010–016, 024), Estudio y Propiedades (017–021),
   Feed y Notificaciones (022–023).
4. Tanda 3 en una rama de copy y consistencia (030–048) y una migración de
   etiquetas y permisos (UX-032 en la base y SEC-2).
5. Tanda 4 con axe y pruebas en móvil.
6. Segunda auditoría: lo que quedó fuera de esta tanda, con los roles owner y
   agent.
