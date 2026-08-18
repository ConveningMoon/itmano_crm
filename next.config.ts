import type { NextConfig } from "next";

// Host de Supabase Storage, derivado del env en vez de hardcodear el project ref
// — así un cambio de proyecto no deja las imágenes rotas en silencio.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    // Sin esto, next/image rechaza cualquier URL remota y toca caer a <img>
    // plano: se sirve el original a tamaño completo, sin WebP ni redimensionado.
    // Las fotos de propiedades son la superficie más pesada del producto Y las
    // que ve el visitante del catálogo público, así que es donde más pesa.
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
  // sharp ships a native binary; keep it as a real require() at runtime instead
  // of letting the bundler trace/link it (Turbopack's Windows junction-point
  // creation for it fails outright on some filesystems).
  serverExternalPackages: ["sharp"],
  // The Carousel Engine compositor rasterizes bundled OFL fonts (opentype.js →
  // paths → sharp). Next's file tracer must copy the .ttf files into the
  // serverless function of EVERY route that composes a slide — fonts.ts reads
  // them from process.cwd(), so a route without them dies at runtime with
  // "Fuente del carrusel no encontrada". Two routes render today: the admin
  // page's server actions and the cron that drains slides left pending.
  outputFileTracingIncludes: {
    "/admin/carousels": ["./src/lib/carousels/fonts/**"],
    "/api/cron/carousel-render": ["./src/lib/carousels/fonts/**"],
    // El render del Estudio inyecta las fuentes como data URI: los .ttf tienen
    // que viajar en el bundle de ESTA función, y public/ no se traza solo.
    "/api/studio/render": ["./public/studio/fonts/**"],
  },
  experimental: {
    // Cache del router en el cliente. Desde Next 15 `dynamic` viene en 0, así
    // que CADA navegación a una página dinámica —incluido volver atrás a una que
    // se acaba de ver— dispara un round-trip completo al servidor. Todo el CRM es
    // dinámico (lee cookies para el contexto de tenant), así que el default deja
    // el cache apagado en toda la app.
    //
    // 30s es la ventana de ida y vuelta típica (lead → volver a la lista → otro
    // lead) y no arriesga datos viejos: toda mutación pasa por Server Actions que
    // llaman a revalidatePath, y eso invalida este cache al instante. Lo único
    // que puede quedar hasta 30s atrás es un cambio hecho FUERA de esta pestaña.
    staleTimes: {
      dynamic: 30,
      static:  300,
    },
    serverActions: {
      // Default is 1 MB, which silently rejects any Server Action request body
      // above that before our own code runs. Property media uploads validate
      // up to 10 MB per file (see MAX_UPLOAD_BYTES in properties/actions.ts),
      // so the limit here must comfortably exceed that plus multipart overhead.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
