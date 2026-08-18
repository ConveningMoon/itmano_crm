# Editor de plantillas del Estudio — decisiones de diseño

**Estado: brainstorm a medias.** Las decisiones de abajo están tomadas y no hay que
volver a discutirlas. Las preguntas abiertas son el punto por donde continuar.

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
plantilla rota. Sí hace falta decidir qué pasa con HTML arbitrario ejecutándose en
un Chrome del servidor (ver preguntas abiertas).

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

## Preguntas abiertas

Por aquí se continúa.

1. **Dónde vive el editor en la interfaz.** ¿Cuarta pestaña del Estudio, o dentro
   del centro de control de super_admin?
2. **Contrato de datos de la plantilla.** Cómo se declaran los huecos
   (`{{headline}}`, `{{price}}`…), qué pasa cuando un dato falta —que es la mitad
   difícil de una plantilla: hoy los diseños resuelven titulares de una a tres
   líneas, piezas sin cifra, sin foto y sin retrato— y cómo se declara ese
   comportamiento sin volver a escribir código.
3. **Datos de ejemplo.** De dónde salen los que alimentan la vista previa del
   editor y la miniatura. Hoy viven en el fixture de `tests/studio/templates.test.tsx`.
4. **Versionado.** Editar una plantilla cambia las piezas futuras. ¿Y las ya
   publicadas, si alguien pulsa "Recomponer"?
5. **Seguridad del render.** HTML arbitrario en un Chrome del servidor. Aunque el
   autor sea super_admin, hay que decidir si se desactiva JavaScript en la página
   y si se bloquean las peticiones externas.
6. **Fuentes.** Cuáles se ofrecen y cómo se le sirven a Chrome. Hoy el Estudio
   tiene dos: Spectral y Marcellus (`src/lib/studio/render/fonts.ts`).
7. **Presupuesto de la función.** Arranque en frío, memoria, y si el render debe
   irse a una ruta propia en vez de vivir en la server action actual.
8. **Qué pasa con lo que no usa plantillas:** el compositor de bandas
   (`src/lib/studio/compositor.ts`, para piezas anteriores) y la pestaña "Mi
   Imagen", que devuelve la imagen del modelo tal cual.

---

## Dónde está el código hoy

- Plantillas: `src/lib/studio/templates/` — doce diseños + `registry.ts` + `primitives.tsx` + `editorial-shell.tsx`
- Render: `src/lib/studio/render/satori.ts`, `render/fonts.ts`
- Pipeline: `src/lib/studio/generate.ts` (`renderTemplatePiece`, `generateStudioImage`, `recomposeStudioImage`)
- Datos que recibe una plantilla: `src/lib/studio/templates/types.ts` (`TemplateProps`) y `src/lib/studio/template-props.ts`
- Formulario: `src/app/(dashboard)/studio/recipe-form.tsx`
- Miniaturas: `scripts/gen-template-thumbs.mjs` + `public/studio/templates/*.webp`
