// Server-safe: el shimmer vive en la clase .skeleton de globals.css.
// Reemplaza los Skeleton locales duplicados en cada loading.tsx.
export function Skeleton({
  w,
  h,
  r = 8,
  style,
}: {
  w: string
  h: number
  r?: number
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: `${h}px`, borderRadius: `${r}px`, ...style }}
    />
  )
}
