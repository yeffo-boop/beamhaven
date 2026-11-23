"use client";

import { createAuthClient } from "better-auth/client";

/**
 * Browser-side helper that talks to /api/auth on the same site. No URL is
 * given on purpose: it uses the address the page was loaded from, so the
 * domain is never baked into the JavaScript (ADR-011).
 */
export const authClient = createAuthClient();
