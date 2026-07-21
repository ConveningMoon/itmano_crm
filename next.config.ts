import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp ships a native binary; keep it as a real require() at runtime instead
  // of letting the bundler trace/link it (Turbopack's Windows junction-point
  // creation for it fails outright on some filesystems).
  serverExternalPackages: ["sharp"],
  // The Carousel Engine compositor rasterizes bundled OFL fonts (opentype.js →
  // paths → sharp) inside the /admin/carousels server actions. Next's file
  // tracer must copy the .ttf files into that route's serverless function.
  outputFileTracingIncludes: {
    "/admin/carousels": ["./src/lib/carousels/fonts/**"],
  },
  experimental: {
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
