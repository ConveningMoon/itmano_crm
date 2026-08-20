# Editor de plantillas del Estudio — decisiones de diseño

**Estado: diseño cerrado.** Nada de lo que hay aquí se vuelve a discutir; lo que
sigue es escribir el plan de implementación.

**Objetivo:** que Dylan diseñe las plantillas del Estudio él mismo, sin escribir
código de la aplicación ni desplegar, con la mayor libertad visual posible.

---

## Decidido

### 1. El motor de render pasa de satori a Chrome sin interfaz

Las plantillas dejan de ser funciones TSX y pasan a ser **HTML/CSS reales**,
renderizadas por `puppeteer-core` + `@sparticuz/chromium` a un PNG de 1080×1350.

El motivo no es la fidelidad, es el **bucle de trabajo**: con Chrome, el editor y
el renderizador son el mismo motor, así que la vista previa del editor puede ser
un `iframe` con exactamente el mismo HTML que produce el PNG. Lo que se ve es lo
que sale.

Con satori eso es imposible por construcción: el navegador y satori no coinciden.
Solo en la sesión del 18 de agosto costó tres ciclos de "renderizar, mirar el PNG,
corregir a ciegas" — la foto mosaicada por falta de `background-repeat`, el
`background-size: cover` que satori ignora, y el recorte con `overflow` + esquinas
redondeadas que no recorta. Diseñar con la vista previa mintiendo es el problema
que este proyecto viene a quitar.

Alternativas descartadas y por qué:

| Motor | Descartado porque |
|---|---|
| satori (actual) | Sin CSS grid, sin filtros, sin modos de fusión; su subconjunto de CSS es el techo de "lo más customizable posible" |
| node-canvas / skia | No hay motor de maquetación: cada línea se coloca a mano. Es un paso atrás |
| resvg + SVG | SVG tampoco maqueta: sin ajuste de línea, sin flexbox |
| Servicios externos (Bannerbear, Placid…) | Costo por imagen, dependencia externa, y los datos del cliente saldrían del sistema |

`@vercel/og` no es una opción distinta: es satori por dentro.

**Costos aceptados:** el arranque en frío pasa de ~0,4 s a ~2 s (la primera pieza
tras un rato sin uso; luego <1 s), la función engorda ~50 MB, y una actualización
de Chrome puede mover un píxel. Asumible para una herramienta interna que genera
una imagen por vez.

### 2. Autor único

Diseña **solo Dylan**, ahora y a futuro. Los tenants eligen entre lo que él haya
hecho. El editor vive detrás de `super_admin`, como el resto del Estudio.

Consecuencia: no hacen falta barandillas para impedir que un tercero publique una
plantilla rota. El HTML arbitrario en un Chrome del servidor sí se acota, pero por
higiene y no por desconfianza (ver decisión 14).

### 3. Se empieza por el editor de código, el lienzo viene después

El destino es **lienzo + vía de escape a HTML/CSS**. Se construye en ese orden:

1. **Primero:** editor de HTML/CSS dentro del CRM, con vista previa en vivo y
   datos de ejemplo. Libertad total desde el primer día.
2. **Después:** lienzo de arrastrar y soltar sobre 1080×1350 que emite ese mismo
   HTML/CSS, con el editor de código como escape cuando el lienzo se quede corto.

Este documento cubre la primera etapa.

### 4. Para quien CREA posts no cambia nada

El formulario, las recetas, el selector de diseños con miniaturas,
**Previsualizar**, la biblioteca, la marca de IA y el costo se quedan como están.
`renderTemplatePiece` sigue recibiendo un formulario y devolviendo un PNG; cambia
por dentro.

Es una restricción del proyecto, no un efecto secundario: el subsistema de autoría
no debe alterar la experiencia de consumo.

### 5. Las plantillas pasan a ser filas, no archivos

Viven en la base para poder editarlas sin desplegar (en Vercel no se escribe en el
sistema de archivos). Las doce actuales se siembran como filas.

**Las claves tienen que sobrevivir** (`mosaico-listing`, `editorial-sold`, …): las
piezas ya guardadas las referencian en `studio_images.template`, y sin ellas
"Recomponer" y "Variante" dejan de funcionar sobre lo publicado.

### 6. Las miniaturas se generan al guardar

Hoy son doce `.webp` que produce `scripts/gen-template-thumbs.mjs` y se commitean.
Pasan a generarse al guardar la plantilla —renderizándola con los datos de
ejemplo— y a subirse al bucket. El tenant sigue viendo tarjetas con imagen.

### 7. Inventario: qué se porta y qué se rehace

| Receta | Diseño | Acción |
|---|---|---|
| Nueva disponible | Mosaico | Portar |
| Nueva disponible | Foto completa | Portar |
| Nueva disponible | Editorial | Portar |
| Casa abierta | Mosaico | Portar |
| Casa abierta | Foto completa | Portar |
| Casa abierta | **Editorial** | **Rehacer** |
| Vendida | Mosaico | Portar |
| Vendida | Foto completa | Portar |
| Vendida | Editorial | Portar |
| Evento | **Agenda** | **Rehacer** |
| Evento | **Foto completa** | **Rehacer** |
| Evento | **Editorial** | **Rehacer** |

Portar = traducir de TSX a HTML/CSS buscando que salga igual. Rehacer = diseñarlos
de cero con la herramienta nueva.

---

## Arquitectura

### 8. El documento se arma con una función pura, y ese es el mecanismo entero

`src/lib/studio/templates/document.ts`:

```
buildTemplateDocument({ html, css, values, flags }) → string
```

Sin `server-only` y sin dependencias de Node, porque **la usan los dos lados**: el
servidor le pasa el resultado a Chrome, y el editor lo mete en el `srcdoc` del
iframe. No son dos caminos que se parecen: es el mismo documento. Ahí vive la
promesa de la decisión 1 — no en el hecho de que ambos sean Chrome.

Ser pura tiene un segundo efecto: todo el contrato de plantilla se prueba sin
levantar un navegador.

El documento lleva, en este orden: el reset, los `@font-face` en `data:`, el CSS
del autor, y su HTML dentro de un `<html>` con las clases de estado.

### 9. La plantilla es una fila, con el HTML y el CSS separados

Migración `104_studio_templates.sql` (era la 103 hasta que `main` reclamó ese número para `agent_api`):

| Columna | Para qué |
|---|---|
| `key` (PK) | Las doce claves actuales se conservan (decisión 5) |
| `label`, `hint` | Lo que enseña el selector de diseños |
| `recipes[]`, `aspects[]` | Para qué receta sirve |
| `html`, `css` | Lo que escribe el autor |
| `slots` (jsonb), `ideal_photos` | **Inferidos al guardar** (decisión 11) |
| `thumb_path` | La miniatura en el bucket (decisión 6) |
| `updated_at` | |

Separadas y no un único documento porque el renderizador mete lo suyo **entre** las
dos: el reset y las fuentes van antes del CSS del autor, y las clases de estado en
el `<html>` que envuelve su HTML.

`src/lib/data/studio-templates.ts` sustituye a `templates/registry.ts` con las
mismas firmas (`findTemplate`, `templatesForRecipe`). `templateFit` se queda pura
donde está. Ninguna pantalla de consumo se entera.

### 10. El editor vive en su propia ruta

`/studio/plantillas`, mismo guard `canUseStudio`, a pantalla completa: hacen falta
el código y un lienzo de 1080×1350 lado a lado, y las pestañas del Estudio viven
en una rejilla de 420px + resto. Se llega desde un enlace en el Estudio y desde
"editar este diseño" en el selector.

No es una cuarta pestaña, aunque el motor de carruseles siente ese precedente: la
decisión 4 dice que la experiencia de consumo no se toca, y una pestaña
"Plantillas" pone la autoría al mismo nivel que Posts y Mi Imagen.

---

## El contrato de plantilla

### 11. Tres capas, y cada una sustituye a un trozo de TSX

| Escritura | Qué hace | A qué sustituye |
|---|---|---|
| `{{price}}` | Sustituye el valor | La interpolación de JSX |
| `{{#price}}…{{/price}}` | El bloque **desaparece** si no hay dato | `{p.price && <bloque/>}` |
| Clases en `<html>` | `sin-precio`, `sin-agente`, `fotos-2`, `datos-3` | `photoHeight(blocks)` del editorial |

Las dos primeras las resuelve un motor propio de unas cuarenta líneas, sin
dependencia. La tercera es la que hace posible **rehacer el editorial sin código**:
`html.datos-3 .foto { height: 700px }` es literalmente la tabla de `photoHeight`
escrita en CSS. Sin ella, un diseño sólo reacciona a *qué* falta, y el editorial
reacciona a *cuánto* hay.

Cada una por separado se descartó por eso: secciones solas no recolocan, y clases
solas dejan en el árbol bloques ocultos que el autor tiene que recordar. La
plantilla como función JS se descartó porque es volver a escribir código y obliga
a permitir JavaScript en el render (decisión 14).

**Los slots se infieren del propio HTML al guardar.** `{{clave}}` suelta →
requerida; `{{#clave}}` → opcional; las miniaturas se cuentan para `ideal_photos`.
El aviso de encaje —que hoy avisa ANTES de renderizar— sigue funcionando sin que
nadie declare lo mismo dos veces. Declararlo a mano habría creado una segunda
fuente de verdad capaz de contradecir al diseño.

### 12. Datos de ejemplo: un módulo compartido, con escenarios

El fixture sale de `tests/studio/templates.test.tsx` a
`src/lib/studio/sample-data.ts` y pasa a ser la única fuente para el test, la
vista previa y la miniatura. Ya lo era a medias: las miniaturas de hoy salen de
ese mismo fixture.

Por receta hay varios escenarios: **completo · mínimo · titular de tres líneas ·
sin foto de agente**. El editor los alterna con un selector; la miniatura usa
siempre el completo.

No es un lujo: con la decisión 11, la mitad difícil de una plantilla es lo que pasa
cuando un dato falta, y una vista previa con todo relleno no enseña precisamente
eso. Los escenarios son estructurales, no de contenido, así que viven en código sin
traicionar el "sin desplegar" — lo que se edita sin desplegar es el diseño.

Un matiz que no afecta a la maquetación: en la vista previa las fotos van por URL y
en el render van en `data:`. Cambia el valor de un atributo, no el resultado.

### 13. Cada pieza guarda la plantilla con la que se hizo

`studio_images.template_snapshot` (jsonb, `{html, css}`) se escribe al generar,
igual que ya se escribe `form_json`. La pieza ya era autocontenida en su mitad de
datos; ahora lo es entera.

**Recomponer repinta con el snapshot. Variante toma el diseño vivo.** Recomponer
existe para arreglar un precio mal escrito: si entre medias el mosaico se
rediseñó, ese arreglo devolvería una pieza distinta a la que el tenant ya publicó,
y nadie pidió eso.

Se prefirió al historial de versiones en tabla aparte porque da la misma fidelidad
sin una tabla nueva ni una política de purga, y deja la pieza reproducible aunque
la plantilla se borre. El costo es que un arreglo posterior de la plantilla no
llega a lo viejo; para eso está Variante.

---

## El Chrome del render

### 14. Sin JavaScript y sin red

JavaScript desactivado, e interceptor de peticiones que sólo deja pasar `data:` y
`about:blank`.

La red es la palanca que importa: la página ya no necesita salir a internet
—`buildTemplateProps` baja las fotos y las mete como data URI, y las fuentes se
sirven locales—, así que un Chrome con salida a internet y HTML arbitrario es
superficie regalada sin comprar nada.

JavaScript compra poco: con la decisión 11 la plantilla es declarativa, y los
diseños de hoy tampoco miden nada (`Headline` sólo hace `flex-wrap`; `typeset.ts`,
que sí ajusta y trunca, lo usa el compositor, no las plantillas). Lo único que
habilitaría es encoger el titular hasta que quepa, y con Chrome el flex ya absorbe
la tercera línea.

**La consecuencia que hay que recordar:** si algún día se quiere ajuste por
medición, hace falta JS activo — `page.evaluate` no corre con JavaScript
desactivado. Es reversible, pero no es gratis decidirlo después.

### 15. Fuentes: catálogo curado en el repo

De 8 a 12 familias OFL empaquetadas —las dos de hoy (Spectral, Marcellus) más una
selección para cartel—, inyectadas como `@font-face` con `src: url(data:…)`, que es
lo que pasa el filtro de la decisión 14. El editor las lista por nombre.

Con dos familias, "la mayor libertad visual posible" se queda corta: los doce
diseños actuales se parecen entre sí en parte por eso. Añadir una familia nueva sí
pide un deploy, y es el precio de no arrastrar la licencia de cada archivo que
alguien suba.

### 16. El render sale a su propia ruta

`/api/studio/render`, runtime Node: POST `{ document, width, height }` → PNG. Tres
llamadores: generar, recomponer y la miniatura al guardar.

Si `renderTemplatePiece` siguiera importado desde la server action, los ~50 MB de
Chromium entrarían en el bundle de `/studio` **y** en el del editor, y el arranque
en frío lo pagaría también quien sólo entra a mirar la biblioteca. Con ruta propia,
esos megas y ese arranque viven en una función que sólo se invoca al generar, con
su `maxDuration` y su memoria.

La regla del proyecto contra el auto-POST (la de `processSequenceRun`) **no aplica
aquí**: aquella era una carrera de visibilidad de filas en la base. Esta ruta no lee
nada — recibe HTML y devuelve bytes.

La vista previa del editor no entra en esta cuenta: es un iframe en el navegador de
Dylan. Chrome del servidor sólo hace falta para el PNG.

**Configuración necesaria:** `serverExternalPackages` con `puppeteer-core` y
`@sparticuz/chromium`, y `outputFileTracingIncludes` con las fuentes para esta ruta
— hoy esa lista sólo cubre `/admin/carousels` y el cron de carruseles.

**Trampa de local:** `@sparticuz/chromium` no arranca en Windows. El
`executablePath` sale de una variable de entorno que apunta al Chrome instalado, y
sólo en Vercel se usa el binario empaquetado. Hay que resolverlo en el primer
commit del render, o el bucle de trabajo no existe en la máquina de Dylan.

---

## Qué se retira

### 17. El compositor se va; Mi Imagen se queda intacta

Se retira `src/lib/studio/compositor.ts` con su maquinaria de bandas (`piecesFor`,
`textPath`, `resolveZone`/`textBand` y `typeset.ts`).

Cuesta nada: en producción hay **una** pieza por ese camino, de prueba y del mismo
18 de agosto (consultado por el MCP). El botón de recomponer no se le quita a nada
publicado.

**Mi Imagen no cambia**, y por eso hay que retirarlo con cuidado: hoy pasa por el
compositor. Para `open_prompt`, `piecesFor` devuelve `[]` y `composeStudioImage`
sale por `return base.toBuffer()`, así que de todo el archivo usa seis líneas —
encajar la imagen a 1080×1350 con `fit: cover` y el degradado de respaldo cuando no
hay fondo. Esas seis líneas se rescatan a un `finish-free-image.ts` de veinte.

`opentype.js` se queda: lo usa el motor de carruseles.

### 18. Y con las plantillas migradas, satori

Salen del repo los doce `.tsx`, `primitives.tsx`, `editorial-shell.tsx`,
`render/satori.ts`, `scripts/gen-template-thumbs.mjs`, los doce `.webp` de
`public/studio/templates/` y la dependencia `satori`. El compositor **no** depende
de satori (dibuja con sharp y trazados de opentype), así que las dos retiradas son
independientes entre sí.

---

## Verificación

**`test:unit` no levanta Chrome.** Sus seis segundos y su "sin secretos" son la
razón por la que esa suite se corre siempre; meterle un navegador la convierte en
otra cosa. Lo que se prueba en unitario es `document.ts` —sustitución, secciones
que desaparecen, clases de estado, inferencia de slots— más `templateFit`, que
sigue pura. Es el contrato entero, y es donde estarán los fallos.

Que las doce plantillas rendericen de verdad se comprueba con un script bajo
demanda, como hoy hace `STUDIO_OUT_DIR` en el test de plantillas.

Lo demás, lo de siempre: `npm run lint`, `npx tsc --noEmit` y `npm run build` antes
de pushear.

---

## Dónde está el código hoy

- Plantillas: `src/lib/studio/templates/` — doce diseños + `registry.ts` + `primitives.tsx` + `editorial-shell.tsx`
- Render: `src/lib/studio/render/satori.ts`, `render/fonts.ts`
- Pipeline: `src/lib/studio/generate.ts` (`renderTemplatePiece`, `generateStudioImage`, `recomposeStudioImage`)
- Datos que recibe una plantilla: `src/lib/studio/templates/types.ts` (`TemplateProps`) y `src/lib/studio/template-props.ts`
- Formulario: `src/app/(dashboard)/studio/recipe-form.tsx`
- Miniaturas: `scripts/gen-template-thumbs.mjs` + `public/studio/templates/*.webp`
- Fuentes empaquetadas: `src/lib/carousels/fonts/` (cuatro `.ttf` OFL), leídas por `readFontBuffer`
