# Estudio — generación de imágenes para el tenant

Fecha: 2026-08-08
Estado: aprobado, pendiente de plan de implementación

---

## 1. Problema

El motor de carruseles (`/admin/carousels`) demostró que el CRM puede producir
material de marca publicable. Hoy solo lo usa ITMANO: `canAccessCarouselEngine`
devuelve true únicamente para `super_admin`.

Lo que el agente inmobiliario necesita a diario no es un carrusel de tendencias:
es la imagen suelta de una casa abierta, una casa nueva en el mercado, una
vendida y un evento. Eso hoy lo resuelve fuera del CRM, con Canva o pidiéndoselo
a alguien.

El objetivo es una página propia de creación de contenido visual, con el
generador de imágenes como pieza principal y el motor de carruseles como
segunda pestaña. Se construye completa pero **sigue cerrada a los tenants**: el
cliente ve el ítem en el nav con badge "Pronto" y una página que le anticipa lo
que viene. Abrirla debe ser cambiar una función de acceso, no una migración.

## 2. Alcance

**Dentro:**

- Ruta `/studio` con tabs `Imágenes` · `Carruseles`.
- `/admin/carousels` redirige a `/studio`; el motor entra entero como tab.
- Generador de imágenes con cinco recetas (cuatro estructuradas + prompt abierto).
- Selector de propiedad que autorellena las recetas de casa.
- Biblioteca persistente por tenant, con descarga, variante y recomposición.
- Página teaser para roles de tenant.
- Registro de costo de IA en `ai_usage_events` y gate de presupuesto.

**Fuera:**

- Usar la biblioteca desde propiedades o emails.
- Composición de texto en el prompt abierto.
- Video, y editor manual del layout.
- Abrir el generador a los tenants (solo la página teaser).
- Meter el costo de las imágenes de carrusel al ledger de IA (hueco conocido,
  documentado en §8, no se toca en esta entrega).

## 3. Estructura y acceso

Ítem de nav **"Estudio"** (icono `Sparkles`), después de Analytics.

| Rol | Nav | `/studio` |
|---|---|---|
| `super_admin` | "Estudio" | página real, tabs Imágenes · Carruseles |
| `agent_owner` / `agent` | "Estudio · Pronto" | página teaser |

El guardia vive en `src/lib/access/studio.ts`, aislado igual que
`src/lib/access/carousel-engine.ts`:

```ts
export function canUseStudio(user: { role: TenantRole }): boolean {
  return user.role === 'super_admin'
}
```

Abrir a tenants = cambiar esa función. Ni la ruta ni las server actions se
tocan. **Cada server action del estudio la llama**, no solo la página.

`NavItemDef` gana `badgeLabel?: string` (el `badge` actual es numérico y se usa
para contadores). El badge de texto se renderiza en `var(--text-muted)` sobre
`var(--bg-overlay)`, no en dorado: no debe competir visualmente con los
contadores de solicitudes o notificaciones.

`/admin/carousels/page.tsx` se reduce a `redirect('/studio')`. El motor no se
refactoriza: `CarouselsTabs` se monta tal cual dentro del tab `Carruseles`, con
sus sub-tabs Generar · Contexto · Costos anidados. El componente `Tabs` usa
`useId` para el `layoutId`, así que dos niveles anidados no interfieren.

`maxDuration = 120` en `/studio`, igual que la ruta de carruseles: la generación
encadena una llamada a Claude, una a Nano Banana y una composición con sharp.

## 4. Las recetas

Cinco formularios distintos, no uno genérico con campos opcionales. La
validación corre **antes** de gastar un token — es el requisito explícito:
ninguna generación empieza con datos incompletos.

### 4.1 Casa abierta (`open_house`)

| Campo | Tipo | Obligatorio |
|---|---|---|
| `property_id` | selector de propiedad | no |
| `address` | texto | **sí** |
| `date` | fecha | **sí** |
| `time_start`, `time_end` | hora | **sí** |
| `refreshments` | booleano | no |
| `agent_id` | selector de agente del tenant | no |
| `phone` | texto | no |

### 4.2 Nueva disponible (`new_listing`)

| Campo | Tipo | Obligatorio |
|---|---|---|
| `property_id` | selector | no |
| `address` | texto | **sí** |
| `price` | número | **sí** |
| `bedrooms`, `bathrooms`, `sqft` | número | no |
| `highlights` | hasta 3 textos cortos | no |
| `agent_id`, `phone` | | no |

### 4.3 Vendida (`sold`)

| Campo | Tipo | Obligatorio |
|---|---|---|
| `property_id` | selector | no |
| `address` | texto (acepta solo la zona) | **sí** |
| `show_price` | booleano (default false) | no |
| `price` | número — requerido si `show_price` | condicional |
| `note` | texto corto ("vendida en 9 días") | no |
| `agent_id` | | no |

### 4.4 Evento (`event`)

| Campo | Tipo | Obligatorio |
|---|---|---|
| `title` | texto | **sí** |
| `event_type` | seminario · webinar · casa abierta comunitaria · otro | no |
| `date`, `time_start` | | **sí** |
| `venue` | texto | **sí** |
| `is_free` | booleano | no |
| `price` | número — requerido si `is_free` es false | condicional |
| `signup` | URL o teléfono | no |
| `agent_id` | | no |

### 4.5 Prompt abierto (`open_prompt`)

Un solo campo obligatorio: `prompt`. No compone texto — devuelve la imagen
limpia.

### 4.6 Campos comunes a las cinco

| Campo | Detalle |
|---|---|
| `style` | dropdown, uno de los seis de §5 |
| `palette` | tags de color (color picker), precargados con `tenants.primary_color` y `agents.accent_color`; máximo 4 |
| `reference` | imagen subida, o una foto de la propiedad elegida con un clic |
| `aspect` | `1:1` · `4:5` · `9:16` |

### 4.7 Selector de propiedad

En las tres recetas de casa, arriba del formulario. Al elegir una propiedad del
tenant se rellenan `address` (con `city`/`state`), `price` desde `list_price`,
`bedrooms`, `bathrooms`, `sqft`, y sus fotos (`image_url`, `gallery`) aparecen
como referencia visual de un clic.

Todo queda editable, y el selector se puede saltar por completo: el caso "aún no
la cargué" y el de una propiedad de otra agencia son comunes al armar contenido.

Se guarda `property_id` en la fila para poder rastrear qué se publicó de cada
propiedad, pero con `on delete set null`: borrar una propiedad no borra la
imagen que ya se produjo.

## 5. Estilos

Seis, como dato en `src/lib/studio/styles.ts` — no texto libre. Cada uno con la
línea que ve el usuario y el fragmento de dirección de arte que consume el
director de prompt.

| Clave | Etiqueta | Lo que ve el usuario |
|---|---|---|
| `editorial` | Fotografía editorial | Luz natural, encuadre de revista de arquitectura |
| `render` | Render arquitectónico | Limpio y volumétrico, como un render de proyecto |
| `typographic` | Minimalista tipográfico | Fondo sobrio de color, sin escena: el texto manda |
| `warm_home` | Cálido de hogar | Interiores vividos, luz de tarde, sensación de familia |
| `night_luxury` | Lujo nocturno | Contraste alto, luces cálidas contra azul de anochecer |
| `flat_illustration` | Ilustración plana | Vectorial, formas simples — funciona bien en eventos |

## 6. Cómo sale la imagen

```
formulario → zod (por receta) → gate de IA
   → Claude Haiku: prompt de escena + zona de texto
   → Nano Banana: la escena
   → sharp: los datos exactos sobre la zona reservada
   → bucket + fila ready
```

**Paso 1 — director de prompt** (`src/lib/studio/prompt-director.ts`).
Claude Haiku recibe la receta, los datos, el perfil de marca del tenant, el
estilo y la paleta, y devuelve JSON:

```json
{ "scene_prompt": "...", "text_zone": "bottom" }
```

`text_zone` ∈ `top` · `bottom` · `left`. Es la unión entre los dos pasos: el
modelo sabe dónde dejó el espacio limpio y el compositor escribe justo ahí.
Formato 9:16 fuerza `bottom` o `top` (una banda lateral en story no funciona).

Un reintento ante fallo. Si el segundo falla, la generación termina con error
claro **sin gastar la imagen**. No hay camino de prompt alternativo: dos rutas
de prompt serían dos calidades distintas que mantener y probar.

**Paso 2 — escena.** `generateImage()` de `src/lib/carousels/gemini.ts` se
extiende para aceptar una imagen de referencia opcional como `inline_data`.
Cambio aditivo: la firma actual sigue igual y los carruseles no se enteran.

**Paso 3 — composición** (`src/lib/studio/compositor.ts`). Reusa la carga de
fuentes de `src/lib/carousels/fonts.ts`. Escribe según la receta:

| Receta | Qué compone |
|---|---|
| `open_house` | Etiqueta "CASA ABIERTA" · fecha y horario en grande · dirección · refrigerios si aplica · agente y teléfono · logo |
| `new_listing` | Etiqueta "NUEVA DISPONIBLE" · la cifra en grande · dirección · fila hab/baños/sqft · destacados · agente y teléfono · logo |
| `sold` | Etiqueta "VENDIDA" · dirección o zona · cifra si se pidió · nota · agente · logo |
| `event` | Título en grande · fecha y hora · lugar · "Gratis" o la cifra · cómo registrarse · logo |
| `open_prompt` | Nada |

Marca: `tenants.logo_url` si existe, acento `tenants.primary_color`, agente
`agents.name` + `agents.phone`. Nada hardcodeado.

**Nota de voz:** el compositor nunca escribe las palabras "precio", "costo" ni
"desde". Los listados muestran la cifra sola; los eventos muestran "Gratis" o la
cifra. Evita chocar con la regla de marca sin forzar "inversión" sobre el precio
de una casa, que sonaría raro en el material del tenant.

Formatos: `1:1` → 1080×1080, `4:5` → 1080×1350, `9:16` → 1080×1920. En 9:16 el
compositor respeta márgenes seguros arriba y abajo para no quedar debajo de la
interfaz de Instagram.

Texto que no cabe: se trunca con elipsis en dirección y nota. La fuente nunca
baja de su mínimo legible — antes se recorta el texto que se sacrifica la
lectura.

**Degradación.** Si Nano Banana falla, se cae a fondo procedural (color de marca
+ textura) y **el texto se compone igual**; la fila queda `ready` con la nota del
fallo, mismo criterio que `renderOneSlide`. Solo un fallo del compositor deja la
fila en `failed`.

## 7. Modelo de datos

**Migración 093 — `studio_images`:**

```sql
create table studio_images (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references tenants(id) on delete cascade,
  agent_id        text references agents(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  recipe          text not null check (recipe in
                    ('open_house','new_listing','sold','event','open_prompt')),
  property_id     uuid references properties(id) on delete set null,
  form_json       jsonb not null,
  style           text not null,
  palette         text[],
  aspect          text not null check (aspect in ('1:1','4:5','9:16')),
  reference_path  text,
  scene_prompt    text,
  text_zone       text check (text_zone in ('top','bottom','left')),
  background_path text,
  rendered_path   text,
  status          text not null default 'pending' check (status in
                    ('pending','generating','composing','ready','failed')),
  error_message   text,
  cost_usd        numeric(12,6),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on studio_images (tenant_id, created_at desc);
```

`form_json` como snapshot autodescriptivo es deliberado — mismo criterio que
`form_submissions`: cada receta tiene campos distintos y no queremos una
migración por cada ajuste de formulario. Es columna todo aquello por lo que se
filtra, se ordena o se cobra.

`agent_id` es el **agente que aparece en la pieza** (el del formulario), no quien
la generó. Quien la generó vive en `created_by`, y la atribución de costo por
agente ya la resuelve `ai_usage_events.agent_id`.

`property_id` es `uuid`: `properties.id` es uuid, a diferencia de `tenants.id` y
`agents.id`, que son text en este esquema.

**RLS:** `enable row level security` + policy de `select` con
`is_super_admin() or tenant_id = get_my_tenant_id()` — el helper que ya usan
`properties` y el resto de tablas por tenant. Escrituras solo por el
cliente service-role desde las server actions, igual que las tablas de
carruseles. La policy se escribe ya pensando en tenants aunque hoy no entren:
es lo que permite abrir la puerta cambiando solo `canUseStudio`.

**Storage:** bucket público `studio-images`, rutas
`<tenant_id>/<image_id>/{ref,bg,final}.png`. Mismo criterio que
`carousel-assets` y `property-media`: el destino es una red social. Decisión
explícita — quien tenga la URL ve la imagen; los ids son uuid, no adivinables.

## 8. Costos

Hueco actual: las imágenes de Nano Banana **no pasan por `assertAiWithinLimit`
ni entran a `ai_usage_events`**; solo quedan como estimado en `carousel_logs`.
Con un `super_admin` apretando botones da igual; con tenants generando, no.

El estudio sí pasa por el gate y registra dos features nuevas:

| Feature | Proveedor | Costo |
|---|---|---|
| `studio_prompt` | Claude Haiku | real, por tokens |
| `studio_image` | Nano Banana | fijo por unidad (`CAROUSEL_PRICING.imageEstUsd`) |

Eso exige un cambio pequeño en `src/lib/services/ai-usage.ts`: aceptar un costo
directo en vez de derivarlo siempre de tokens. `cost_usd` de la fila guarda la
suma de ambos pasos, para que la biblioteca pueda mostrarle el gasto al
`super_admin` sin recalcular.

El costo de las imágenes de carrusel **no se toca** en esta entrega: es otro
cambio, con su propio riesgo de regresión sobre un motor que funciona.

## 9. La biblioteca

Grid de las imágenes del tenant, más recientes primero, con receta, fecha y
miniatura. Acciones por imagen:

- **Descargar** — el PNG final.
- **Generar variante** — reusa `form_json` y crea una fila nueva. No pisa la
  anterior: comparar dos intentos es el uso normal.
- **Recomponer texto** — reusa `background_path` sin volver a pagar la escena,
  mismo criterio de reutilización que `renderOneSlide`. Es el arreglo barato
  cuando el precio o la fecha salieron mal.
- **Borrar** — fila y objetos del bucket.

Para `super_admin`, además, el costo de cada generación.

## 10. Archivos

| Archivo | Rol |
|---|---|
| `src/lib/access/studio.ts` | `canUseStudio()` |
| `src/lib/studio/recipes.ts` | zod discriminated union por receta (puro) |
| `src/lib/studio/styles.ts` | los seis estilos como dato |
| `src/lib/studio/prompt-director.ts` | Claude → `scene_prompt` + `text_zone` |
| `src/lib/studio/compositor.ts` | sharp: layout por receta × formato |
| `src/lib/studio/generate.ts` | el pipeline, server-only |
| `src/lib/data/studio.ts` | lecturas de la biblioteca |
| `src/app/(dashboard)/studio/page.tsx` | ruta, bifurca por rol |
| `src/app/(dashboard)/studio/actions.ts` | server actions |
| `src/app/(dashboard)/studio/teaser.tsx` | página para roles de tenant |
| `src/app/(dashboard)/studio/*.tsx` | tabs, formulario por receta, biblioteca |
| `supabase/migrations/093_studio_images.sql` | tabla + RLS + bucket |

Tocados: `src/lib/carousels/gemini.ts` (referencia opcional),
`src/lib/services/ai-usage.ts` (costo directo + features nuevas),
`src/components/layout/nav-items.ts` y `nav-item.tsx` (badge de texto),
`src/app/(dashboard)/admin/carousels/page.tsx` (redirect).

`generate.ts` va separado de `actions.ts` por la misma razón que existe
`src/lib/carousels/render.ts`: un archivo `'use server'` convierte cada export
en un endpoint HTTP, así que la lógica compartida no puede vivir ahí.

Tras la migración: `npm run types:db`.

## 11. Pruebas

| Suite | Qué protege |
|---|---|
| `tests/studio/recipes.test.ts` | cada receta rechaza lo incompleto **antes** de gastar nada |
| `tests/studio/prompt-director.test.ts` | armado del prompt y parseo de la respuesta, incluido JSON sucio |
| `tests/studio/compositor.test.ts` | cada receta × formato da las dimensiones exactas; texto largo no desborda |
| `tests/access/studio.test.ts` | quién genera y quién ve el teaser |
| `tests/auth/nav-items.test.ts` | actualizar — refleja el literal del nav |
| `tests/rls/` | `studio_images` se suma al aislamiento por tenant |

Todo menos la última corre en `test:unit`, sin BD ni secretos.

## 12. Riesgos y cosas a verificar

1. **Imagen de referencia en Gemini.** Hay que confirmar la forma exacta de
   `inline_data` en `v1beta` y que los modelos candidatos la acepten. Cuidado:
   `callWithFallback` trata varios errores como "modelo no disponible" y pasa al
   siguiente. Un "no soporta imagen de entrada" debe tratarse como error real,
   no enmascararse saltando de modelo.
2. **Fuentes en sharp.** Reusar `src/lib/carousels/fonts.ts`; no reinventar la
   carga.
3. **Duración.** Claude + Nano Banana + sharp en una sola invocación. Los
   timeouts de Gemini (35 s imagen) ya abortan limpio antes del `maxDuration` de
   120 s, pero conviene medir el caso 9:16 con referencia, que es el más pesado.
