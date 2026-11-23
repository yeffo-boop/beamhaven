import type { NextConfig } from "next";

/**
 * Security headers sent with every response.
 * HSTS is set by Nginx Proxy Manager in production (it owns HTTPS), so it is
 * not repeated here. A Content-Security-Policy is added in Milestone 2, once
 * we know exactly which scripts and styles the app loads.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // Produces a small self-contained server in .next/standalone for Docker (ADR-010).
  output: "standalone",
  // Don't advertise the framework in an "X-Powered-By" header.
  poweredByHeader: false,
  // Next.js 16 caching model: data is dynamic by default, cached only when we opt in.
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
