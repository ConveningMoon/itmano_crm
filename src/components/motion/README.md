# Lenguaje de motion — ITMANO CRM

Contrato único para toda animación en la app. Si un caso no está aquí, se resuelve
con la receta más parecida — no se inventan duraciones nuevas.

## Setup

- Librería: `motion` (motion.dev), importada siempre desde `motion/react` con los
  componentes `m.*` (nunca `motion.*` — `LazyMotion strict` lo bloquea a propósito).
- `MotionProvider` (LazyMotion `domMax` + `MotionConfig reducedMotion="user"`) se
  monta una sola vez en `src/app/layout.tsx`.
- Las animaciones CSS (hover, shimmer) viven en `globals.css` bajo
  "Motion & interaction layer" y usan los tokens `--dur-*` / `--ease-out-premium`.

## Recetas

| Caso | Receta | Primitiva |
|---|---|---|
| Entrada de contenido | fade + translateY(8px) → 0, 350ms, ease-out-premium | `FadeIn` |
| Lista escalonada | 50ms entre hijos, máx ~8 animados | `StaggerGroup` + `StaggerItem` |
| Hover cards/filas | solo borde + sombra + fondo, 150ms, vía clases CSS | `.card-interactive`, `.row-hover` |
| CTA oro | brightness + sombra hover, scale(0.98) active | `.btn-cta` |
| Modales | overlay fade 200ms; panel scale(0.97)→1 + y:8→0, 250ms; exit 150ms | `ModalShell` |
| Números KPI | ~0.8s solo en primer mount; SSR renderiza el valor final | `AnimatedNumber` |
| Barras que crecen (firma) | scaleX/scaleY 0→1, 600ms, delays de 50ms | `GrowBar` |
| Skeletons | shimmer 1.8s lineal | `Skeleton` (`src/components/ui/skeleton.tsx`) |

## Reglas

1. Las primitivas aceptan `children` server-rendered (patrón isla del repo): la
   página sigue siendo Server Component y pasa JSX como children.
2. Nada de translateY en hover salvo -1/-2px en CTA y kanban cards.
3. Entradas solo en el primer render de la página; nunca animar en re-renders.
4. `prefers-reduced-motion` se respeta siempre: MotionConfig cubre motion/react,
   el bloque `@media` de globals.css cubre CSS, y recharts se gatea a mano con
   `matchMedia` (no obedece a MotionConfig).
5. Colores siempre desde tokens (`var(--…)`), jamás hex en componentes.

## Landing pública

La home (`src/app/(marketing)/page.tsx`) se arma con el producto: cada sección
es una réplica de una pantalla del CRM con datos ficticios. Sus escenas viven en
`src/components/marketing/landing/`. Sigue estas reglas además de las de arriba:

- La réplica usa el vocabulario real: etapas, calidades y urgencias salen de
  `src/lib/scoring/priority.ts` (`STAGE_CONFIG`, `QUALITY_CONFIG`,
  `URGENCY_CONFIG`). No se copian etiquetas ni colores a mano.
- Sólo se muestra lo que el producto hace hoy. La etapa la mueve una persona
  (el kanban lo muestra así); calidad y urgencia las calcula el sistema.
- Todo lo que corre en bucle se detiene fuera de pantalla y con reduced motion
  (`useLive` / `useTicker` de `crm-bits.tsx`). Un único juego de hooks: no se
  duplican por componente.
- El estado final viene en el HTML: sin JS o con reduced motion cada escena se
  ve completa y legible.
- Nada de `Math.random()` ni de reloj en el render: los recorridos son fijos y
  la cuenta regresiva arranca de una constante, para no romper el prerender de
  Cache Components ni la hidratación.
- Los datos son ficticios (`demo-data.ts`, correos en example.com) y la página
  lo dice junto a la demo. Las fotos son de Unsplash; su origen está anotado en
  `demo-data.ts`.
