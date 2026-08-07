# Recorrido del producto — archivos del hero

El video del hero de la landing se sirve desde esta carpeta. Los nombres son
fijos: los lee `src/components/marketing/hero-video.tsx`. Mientras no existan,
el hero muestra un marcador sobrio en su lugar.

| Archivo | Obligatorio | Qué es |
|---|---|---|
| `producto.mp4` | sí | H.264, `yuv420p`, sin pista de audio |
| `producto.webm` | opcional | VP9, misma toma; el navegador lo prefiere si está |
| `producto-poster.webp` | sí | Primer frame; se ve mientras carga y con reduced-motion |

**Proporción:** 16:10 (1920×1200). El marco recorta con `object-fit: cover`, así
que un 16:9 también entra sin deformarse.

**Duración:** 24–30 s, en bucle, terminando en el mismo encuadre del inicio para
que el ciclo no salte.

**Peso:** por debajo de 5 MB. Con interfaz plana y CRF 23–24 sobra.

**Sin audio.** El autoplay silencioso es la única forma de que el navegador lo
deje arrancar solo, y la pista de audio sólo suma peso.

## Qué muestra, en orden

1. **0–4 s** — La lista del día ya ordenada. El cursor no toca nada.
2. **4–11 s** — Clic en el primer lead: se abre el análisis de la IA (la lectura,
   la próxima acción, los puntos de conversación). Aquí se demora un segundo más.
3. **11–15 s** — El pipeline: arrastrar ese lead a "en proceso".
4. **15–19 s** — Entra un lead nuevo desde un formulario, ya calificado.
5. **19–23 s** — El aviso de lead caliente.
6. **23–28 s** — Propiedades: publicar una, y aparece en el sitio web.
7. **28–30 s** — Vuelta a la lista del día, mismo encuadre del inicio.

Datos de demostración ficticios siempre — nunca leads reales de un tenant.
