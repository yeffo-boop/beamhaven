/**
 * Builds an absolute URL from the configured public base URL.
 *
 * Every link that leaves the app (invitations, password resets, emails,
 * OAuth callbacks) must be built with this, never with a hardcoded domain,
 * so the domain can change by editing APP_URL (see DOMAIN_MIGRATION.md).
 * Links inside the app should stay relative ("/projects/abc").
 */
export function absoluteUrl(baseUrl: string, path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`absoluteUrl expects a path starting with "/", got "${path}"`);
  }
  if (path.startsWith("//")) {
    // "//evil.example" would be treated as a different host.
    throw new Error("absoluteUrl does not accept protocol-relative paths");
  }
  const base = new URL(baseUrl);
  const result = new URL(path, base);
  if (result.origin !== base.origin) {
    throw new Error("absoluteUrl must stay on the configured origin");
  }
  // Keep any base path (e.g. https://example.com/beamhaven) in front of the path.
  const basePath = base.pathname.replace(/\/+$/, "");
  return `${base.origin}${basePath}${path}`;
}
