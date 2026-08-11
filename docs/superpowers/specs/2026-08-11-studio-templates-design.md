# Estudio — templates de diseño

Fecha: 2026-08-11
Estado: aprobado, pendiente de plan de implementación
Antecede: [`2026-08-08-studio-imagenes-design.md`](2026-08-08-studio-imagenes-design.md)

---

## 1. Problema

El Estudio funciona, pero dos de sus controles no hacen lo que prometen.

**La imagen de referencia y la paleta no llegan al modelo.** Las reglas de
`reference_role` y los colores viven en el system prompt de **Claude**, no en el
prompt que recibe Nano Banana. El modelo de imagen recibe la foto adjunta y un
párrafo que le describe una escena nueva desde cero — así que inventa una escena
nueva. Si Claude no decide repetir esas instrucciones dentro de su párrafo, se
pierden. Es un teléfono descompuesto, y por eso todas las imágenes salen con el
mismo estilo pase lo que pase.

**Y aunque se arreglara, no serviría para lo que hace falta.** La intención real
era: el agente encuentra un diseño en Pinterest, lo sube, y el sistema le
reemplaza los textos y las fotos por los suyos. Un modelo de imagen no hace eso.
No detecta cajas de texto, no respeta tipografías, no mete cuatro fotos en cuatro
slots y no escribe "$274.400" sin equivocarse. Pedírselo contradice de frente la
decisión que sostiene todo el Estudio: **el modelo nunca escribe texto**.

Lo que el agente quiere es un **diseño**, y un diseño no se genera: se elige.

## 2. La idea

La pieza se parte en tres mitades independientes, y la IA se mueve a donde sí
sirve.

| Parte | Quién la produce | Coste |
|---|---|---|
| **Layout** — posiciones, tipografía, bandas, colores | Template (código) | 0 |
| **Fotos** — la casa | Las fotos reales de `properties` | 0 |
| **Texto** — precio, dirección, specs | El formulario por receta | 0 |

La consecuencia que cambia el producto: **una pieza con template y fotos reales
no llama a ninguna IA y no cuesta nada.** La generación con IA queda para el
caso raro (la propiedad no tiene fotos), no para el normal.

## 3. Alcance

**Dentro:**

- Foto de portada del agente, con detección de transparencia.
- Nueve templates (3 × casa abierta, nueva disponible, vendida), solo en 4:5.
- Renderizado con `satori` (JSX + flexbox → SVG → PNG con sharp).
- Selector visual de templates con aviso de encaje.
- Previsualización sin persistir + guardado explícito.
- Retirada de `reference_role: 'style' | 'composition'`.

**Fuera:**

- Templates para `event` y `open_prompt` — siguen con el compositor de bandas.
- Formatos 1:1 y 9:16 (los templates ya declaran `aspects`; añadirlos es aditivo).
- Editor de templates para el tenant. Los templates son producto, no dato.
- Recorte del fondo del agente con IA (ver §4).
- Lista de marcas de cumplimiento por tenant (ver §9).

## 4. Foto de portada del agente

No es "un asset del Estudio": es la foto de portada del agente, que además sirve
aquí. Vive en `agents` y se sube en **Ajustes → Agentes**, en la misma fila donde
el agente ya escribe cómo se presenta, con `requireSelfOrManager` — es suya, la
sube él.

**Opcional en los dos sentidos:** el agente puede no tener foto, y aunque la
tenga, el template puede usarse sin ella.

### 4.1 El fondo se detecta, no se declara

No hay que preguntarle al agente si su PNG tiene fondo transparente. `sharp` lo
sabe:

```ts
const { isOpaque } = await sharp(buffer).stats()
```

| `isOpaque` | Qué se hace |
|---|---|
| `false` — hay transparencia real | Se usa recortado, de cuerpo completo sobre el diseño |
| `true` — no la hay | Círculo, con encuadre por entropía (`position: 'attention'`, que suele acertar la cara) |

El resultado se guarda como `agents.cover_photo_cutout` en vez de recalcularlo:
el compositor decide recorte-o-círculo en cada render y no vamos a descargar y
analizar el PNG en cada uno.

En Ajustes, la recomendación va en términos de resultado, no de formato: *"Si
subes un PNG con el fondo ya recortado, aparecerá de cuerpo completo sobre el
diseño. Si no, se usará dentro de un círculo."*

### 4.2 Por qué NO se recorta con IA

Nano Banana no recorta: **regenera**. Le das la foto del agente y devuelve una
persona redibujada que se le parece. Para la cara de una agente real, con su
nombre al lado, en material que publica con su marca, eso es inaceptable — no es
un recorte, es un retrato falso. La decisión es firme y no es de coste.

## 5. El contrato de templates

Un template es un módulo en `src/lib/studio/templates/`, uno por archivo, que
exporta **qué necesita** y **cómo se dibuja**:

```ts
{
  key:     'mosaico',
  label:   'Mosaico',
  hint:    'Cuatro fotos o más',
  recipes: ['open_house', 'new_listing', 'sold'],
  aspects: ['4:5'],
  slots: {
    required: ['photo.hero', 'text.headline', 'text.price'],
    optional: ['photo.thumbs', 'photo.agent', 'stats', 'text.cta', 'marks'],
  },
  render: (props: TemplateProps) => /* JSX para satori */,
}
```

**La declaración de `slots` no es documentación.** Es lo que hace dos cosas
concretas: que el formulario pida solo lo que ese diseño usa, y que el selector
pueda avisar "mejor con 4 fotos, tienes 2" **antes** de renderizar. Es la misma
idea que las recetas —pedir lo correcto y completo— un nivel más abajo.

### 5.1 Tipos de slot

| Slot | Contenido |
|---|---|
| `photo.hero` | Una foto, la dominante |
| `photo.thumbs` | 0–3 fotos secundarias |
| `photo.agent` | Portada del agente (recorte o círculo, §4) |
| `text.headline` | Titular, con énfasis mixto: `['CASA', {b:'ELEGANTE'}, …]` |
| `text.price` | La cifra |
| `text.address`, `text.phone` | Con ícono |
| `text.cta` | Llamada a la acción |
| `stats` | Lista de pares ícono + valor (sqft, hab, baños) |
| `logo.tenant` | `tenants.logo_url` |
| `marks` | Marcas de cumplimiento (§9) |
| `palette` | 2–3 colores aplicados a bandas y acentos **por el compositor** |

La paleta por fin funciona porque la aplica código a superficies concretas, no un
modelo interpretando una sugerencia.

### 5.2 Lo que el formulario gana

Dos campos nuevos en las tres recetas de casa, porque los templates piden datos
que hoy nadie captura:

| Campo | Detalle | Obligatorio |
|---|---|---|
| `template` | Clave del diseño elegido. Se valida que ese template declare esa receta en `recipes` | Sí en las recetas de casa |
| `headline` | El titular de marketing ("Casa elegante y familiar en venta"). Máx. 60 caracteres | No — por defecto, la etiqueta de la receta |

`headline` merece existir: la etiqueta fija ("NUEVA DISPONIBLE") describe el
hecho, y el titular vende. Sin él, los nueve diseños dirían lo mismo siempre. Con
un default sensato, el agente que no quiera escribirlo no tiene que hacerlo.

El énfasis mixto del titular (`CASA **ELEGANTE** Y **FAMILIAR**`) **no se le pide
al agente**: sería pedirle que marque negritas en un input. Lo resuelve el
template destacando la primera palabra de cada tramo, o el diseño lo trata como
una sola voz. Es decisión del template, no dato del formulario.

## 6. Los nueve templates

Tres por receta, y las tres son decisiones editoriales distintas, no variaciones
de lo mismo:

| Variante | Cuándo la elige el agente |
|---|---|
| **Mosaico** | Tiene 4+ fotos buenas. Hero grande + miniaturas + banda de specs |
| **Foto completa** | Tiene una foto excelente. Ocupa todo; el texto en banda inferior con degradado |
| **Editorial** | Tiene pocas fotos o malas. Manda la tipografía: cifra enorme, bloque de color, foto secundaria |

La tercera no es relleno: resuelve el caso del agente que todavía no tiene sesión
fotográfica, que es justo cuando más le hace falta el diseño.

Solo en **4:5** en esta entrega. Cada template declara sus `aspects`, así que
añadir 1:1 y 9:16 después es aditivo. Un mosaico de cuatro fotos en 9:16 es otro
diseño, no el mismo estirado — mejor nueve terminados que veintisiete a medias.

## 7. El selector

Tres tarjetas con miniatura, nombre y una línea de cuándo usarlo. Aparece después
de elegir receta y propiedad, antes de pedir el resto del formulario. Nadie elige
un diseño de una lista de nombres.

**El aviso de encaje** sale de cruzar `slots` con los datos reales: *"Mejor con 2
fotos, tienes 1"*. **Avisa, no bloquea** — si el agente quiere el mosaico con dos
fotos es su decisión; lo que no puede es enterarse al ver el resultado.

### 7.1 Las miniaturas

Un script (`scripts/gen-template-thumbs.mjs`) renderiza cada template con datos
de ejemplo y escribe `public/studio/templates/<key>.webp`, que se commitea.
Instantáneo, cero coste en runtime, y un test que falla si un template no tiene
miniatura — el olvido común al añadir el décimo diseño.

**Las fotos de esas miniaturas necesitan cuidado.** No pueden ser imágenes
cualquiera de internet: es una página que ve el cliente y la licencia ajena es un
problema real. Tampoco pueden ser fotos de A&J — eso sería hardcodear datos de un
tenant en el repo (regla dura #4). La salida limpia: **generar cuatro casas
neutras una sola vez con Nano Banana** y commitearlas como assets de producto.
Cuestan centavos, una vez, y no tienen dueño.

## 8. Previsualizar y guardar

Como la ruta con template y fotos reales es gratis, la elección se hace mirando.
Eso exige separar dos acciones:

| Acción | Qué hace |
|---|---|
| **Previsualizar** | Renderiza y devuelve la imagen **sin escribir en la base ni en el bucket** |
| **Guardar en la biblioteca** | Persiste la fila y los objetos |

Sin esa separación, saltar entre nueve diseños deja nueve filas de basura en la
biblioteca.

**La previsualización solo existe en la ruta gratis.** Si la pieza necesita IA
para el fondo, se genera y va a la biblioteca como hoy: previsualizar costaría
dinero y "gratis de probar" dejaría de ser cierto.

## 9. Marcas de cumplimiento

El logo de Equal Housing y el del brokerage no son decoración: en publicidad
inmobiliaria de EE.UU. suelen ser obligatorios. Merecen ser un slot del template,
no algo que el agente recuerde pegar.

En esta entrega el slot `marks` renderiza **el logo del tenant** (`logo_url`, que
ya existe). El asset de Equal Housing queda **pendiente de confirmación** junto a
la revisión legal de las páginas legales — no lo damos por libre de uso sin
verificarlo. Una lista de marcas configurable por tenant es trabajo futuro.

## 10. Modelo de datos

**Migración 095:**

```sql
-- Portada del agente: dato del agente, no del Estudio.
alter table agents
  add column if not exists cover_photo_url    text,
  -- De sharp: stats().isOpaque === false. Se guarda para no reanalizar el PNG
  -- en cada render.
  add column if not exists cover_photo_cutout boolean not null default false;

-- Qué diseño produjo la pieza. null = compositor de bandas (event, open_prompt,
-- y todo lo generado antes de esta migración).
alter table studio_images
  add column if not exists template text;
```

La portada va al bucket **`tenant-assets`**, que ya existe, en
`<tenant_id>/agents/<agent_id>/cover.png`. No se crea un quinto bucket para una
imagen por agente.

## 11. Renderizado

`satori` convierte JSX con flexbox a SVG, y `sharp` lo pasa a PNG. Es lo que hay
debajo de `next/og`. Se elige sobre coordenadas a mano porque la gracia del
sistema son *muchos* templates: con coordenadas, cada template nuevo desincentiva
el siguiente.

Necesita las fuentes como buffer — ya las cargamos en
`src/lib/carousels/fonts.ts` con `readFileSync`, así que es el mismo buffer antes
de pasarlo a opentype.

**El spike va primero y es una tarea del plan, no un preámbulo.** Replicar la
imagen de referencia completa —insignia angulada, tres tarjetas superpuestas con
sombra, agente cruzando dos bandas— antes de escribir los otros ocho templates.
Si satori se atraganta con algo, hay que saberlo con un template hecho, no con
nueve a medias. Si el spike falla, la salida es coordenadas a mano y menos
templates, no forzar la librería.

El compositor de bandas actual (`src/lib/studio/compositor.ts`) **se queda tal
cual** para `event`, `open_prompt` y las piezas previas.

## 12. Qué se retira

- **`reference_role: 'style'` y `'composition'`.** Existían para aproximar lo que
  los templates ahora hacen bien. Mantener dos caminos al mismo sitio, uno de los
  cuales no funciona, es peor que tener uno.
- **`subject` se queda**, pero como caso secundario: "mi foto del listado está
  apagada, ponla en hora dorada". Sigue con su límite de no alterar arquitectura
  ni entorno.
- **El teléfono descompuesto se arregla de paso**: la paleta y la regla de
  referencia se concatenan al `scene_prompt` **después** de que Claude responde,
  de forma determinista, en vez de confiar en que las arrastre. Aplica solo a la
  ruta con IA, que es la única que queda.

## 13. Pruebas

| Suite | Qué protege |
|---|---|
| `tests/studio/recipes.test.ts` | Ampliada: `template` obligatorio en recetas de casa, rechazado si el diseño no declara esa receta; `headline` opcional con default |
| `tests/studio/templates.test.ts` | Cada template rinde 1080×1350 PNG; los slots requeridos presentes; texto larguísimo no desborda; un template sin `photo.agent` rinde igual |
| `tests/studio/template-fit.test.ts` | El aviso de encaje: qué se avisa con 1, 2 y 5 fotos, y que nunca bloquea |
| `tests/studio/agent-photo.test.ts` | `isOpaque` decide recorte vs círculo; el círculo sale circular; una imagen corrupta degrada sin lanzar |
| `tests/studio/thumbnails.test.ts` | Todo template tiene su `.webp` en `public/studio/templates/` |
| `tests/rls/` | Las columnas nuevas no abren nada: `agents` ya tiene su policy |

**Lo que los tests NO cubren, y hay que decirlo:** si un diseño se ve bien. No
hay aserción para eso. El plan va a pedir revisión visual explícita de los nueve,
uno por uno, y esa revisión es de Dylan — fingir que la cubre una suite sería
mentir sobre el estado del trabajo.

## 14. Riesgos

1. **satori.** Subconjunto de CSS limitado. El spike de §11 existe para esto.
2. **Fotos remotas.** Cada render descarga 1–4 fotos de `property-media`. Con
   nueve previsualizaciones seguidas eso pesa; conviene descargar una vez por
   propiedad y reusar entre templates.
3. **El aviso de encaje puede mentir.** `photos.length` no dice si las fotos son
   *buenas*. El aviso es sobre cantidad, y el copy debe decir eso y no sugerir un
   juicio de calidad que el sistema no hace.
