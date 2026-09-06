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
