import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy: the browser only loads scripts, styles, images and
 * connections from this site, refuses to be shown inside another site's
 * frame, and only submits forms back to this site.
 *
 * Inline scripts are allowed ('unsafe-inline'), because Next.js and our theme
 * script need them. The stricter alternative, a per-request nonce, would make
 * every page fully dynamic and lose the instant-loading shell (ADR-020).
 * React escapes everything it shows and we never insert user content as raw
 * HTML, which is what keeps injected scripts out. 'unsafe-eval' is only for
 * the development server's hot reloading.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Security headers sent with every response.
 * HSTS is set by Nginx Proxy Manager in production (it owns HTTPS), so it is
 * not repeated here.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
