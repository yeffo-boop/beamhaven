/**
 * Product branding, kept in one place so the name can change before a
 * commercial release without touching business logic (ADR-015).
 *
 * The product name can be overridden at runtime with APP_NAME (see env.ts);
 * this file holds the defaults used when nothing is configured.
 */
export const brand = {
  name: "BeamHaven",
  tagline: "Every project. One place.",
} as const;
