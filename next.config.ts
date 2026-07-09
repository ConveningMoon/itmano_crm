import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
